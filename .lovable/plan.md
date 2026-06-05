## Objetivo

Detectar automaticamente troca de master (AWB) para processos aéreos, registrar histórico, sinalizar visualmente na tela `/air/tracking-aereo` e permitir resolver casos ambíguos via modal.

## 1. Nova tabela de histórico (MariaDB `dados_dachser`)

Criar `t_aereo_master_swap`:

- `id` BIGINT PK AI
- `hawb` VARCHAR(64) — HAWB correspondente (chave de ligação)
- `awb_antigo` VARCHAR(32)
- `awb_novo` VARCHAR(32)
- `fonte` ENUM('DADOS_AEREO','EXTRACTED_EMAILS')
- `id_olss` VARCHAR(64) NULL — preenchido quando fonte = DADOS_AEREO
- `flight_number` TEXT NULL — concatenação de todos os legs (ex: "AC-1070, AC-096")
- `departure_airport` TEXT NULL — idem (ex: "DFW, YUL")
- `destination_airport` TEXT NULL — idem (ex: "YUL, GRU")
- `data_atualizacao` DATETIME DEFAULT CURRENT_TIMESTAMP
- `flag_troca_master` TINYINT(1) DEFAULT 1
- `resolvido_manual` TINYINT(1) DEFAULT 0
- ÍNDICES: (hawb), (awb_novo), (id_olss, data_atualizacao)
- COLLATE utf8mb4_unicode_ci

Migração executada via mariadb-proxy (não Supabase), seguindo padrão atual.

## 2. Detecção automática (novo edge function `air-detect-master-swap`)

**Cron: a cada 30 minutos** (`*/30 * * * *`) via `pg_cron` + `pg_net`.

### 2.1 Via `dados_dachser.t_dados_aereo`
- Agrupar por `id_olss` registros com mais de 1 `awb` distinto E `data_inclusao_nova` distintas.
- AWB com `MAX(data_inclusao_nova)` = novo master; demais = antigos.
- HAWB(s): via `hawb_number` ligados ao mesmo `id_olss`.
- Para cada par (antigo→novo, hawb): se não houver linha equivalente em `t_aereo_master_swap`, inserir com `fonte='DADOS_AEREO'`.

### 2.2 Via `pantheon.extracted_emails`
- Query: `WHERE dachser_pdf_json IS NOT NULL AND dachser_pdf_json LIKE '%"pdf_attachments":%'` desde último cursor (`t_aereo_master_swap.MAX(data_atualizacao)` por `fonte='EXTRACTED_EMAILS'`).
- Parse JSON: para cada `pdf_attachments[].gemini_json.parsed_data`:
  - `mawb_number` → AWB novo
  - `hawb_details[].hawb_number_reference` → HAWBs a atualizar
  - `flight_details[]` → concatenar `flight_number`, `departure_airport`, `destination_airport`
- Para cada HAWB: descobrir AWB antigo atualmente em `t_fato_aereo`. Se diferente do `mawb_number`, registrar em `t_aereo_master_swap` com `fonte='EXTRACTED_EMAILS'`.

**Replicação na `t_dados_aereo` (origem EXTRACTED_EMAILS):**
Quando o swap vier da `extracted_emails`, **inserir nova linha em `t_dados_aereo`** duplicando todas as colunas da linha existente do HAWB+AWB antigo, alterando somente:
- `awb` (coluna master) = `mawb_number` novo
- `master_insert` = `NULL`
- `created_at` = data/hora do processamento (agora)
- demais campos (id_olss, hawb_number, clerk, etc.) preservados.

A linha antiga **não é apagada nem atualizada**. Idempotente: só insere se não existir linha (`hawb_number`, novo `awb`).

### 2.3 Aplicação do swap em `t_fato_aereo`
**Regra (atualizada):** NUNCA alterar `awb`/`mawb` da linha existente em `t_fato_aereo`. Em vez disso:

- Para cada par (awb_antigo → awb_novo, hawb) confirmado como troca de master:
  - `UPDATE t_fato_aereo SET last_status_code = 'DLV' WHERE awb = :awb_antigo AND hawb = :hawb` (linha antiga sai da tela conforme regra de visibilidade vigente para 'DLV').
  - A linha do `awb_novo` (já existente ou criada pelo fluxo normal de ingestão / pela replicação §2.2 em `t_dados_aereo`) permanece ativa e recebe a badge "Troca de master" via lookup em `t_aereo_master_swap`.
- Não tocar em nenhum outro campo da linha antiga nem do master novo.
- Exceção: se houver discrepância (§3), não aplicar 'DLV' automático — ambos os masters seguem ativos como Críticos até resolução manual.
- Manual overrides existentes na linha antiga ficam congelados junto com a linha (que passa a 'DLV'); a linha nova segue suas próprias regras.

## 3. Discrepância de master (cenário ambíguo)

Quando §2.1 encontrar 2+ AWBs com **mesmo `id_olss` E mesma `data_inclusao_nova` E mesmo HAWB**:

- Não aplicar swap automático.
- Registrar em `t_aereo_master_discrepancia` (`hawb`, `awbs_candidatos` JSON, `id_olss`, `data_inclusao_nova`, `status` PENDENTE|RESOLVIDA, `awb_escolhido`, `resolvido_em`, `resolvido_por`).

### UI em `/air/tracking-aereo`
- Processos com discrepância **PENDENTE** entram no card **Críticos** com badge "Discrepância de master".
- Novo botão "Resolver troca de master" → modal:

> "Os processos correspondentes {AWB1} e {AWB2} possuem mesmo ID, data de inclusão e HAWB. Para troca de master correta, qual dos masters seria o correto?"

- Lista de AWBs candidatos com radio.
- Ao confirmar:
  - AWB escolhido = master correto.
  - Para cada AWB descartado: inserir em `t_aereo_master_swap` o par (descartado → escolhido) com `resolvido_manual=1`, `fonte='DADOS_AEREO'`, e `UPDATE t_fato_aereo SET last_status_code='DLV' WHERE awb = :descartado AND hawb = :hawb` (mesma regra do §2.3 — não altera o AWB da linha).
  - `t_aereo_master_discrepancia.status='RESOLVIDA'`.
  - Status Crítico removido do escolhido; badge "Troca de master" passa a aparecer nele.

## 4. UI — Badge "Troca de master"

- Buscar `t_aereo_master_swap` em batch por `awb_novo` ao carregar a lista.
- Renderizar badge "Troca de master" (tooltip com AWB antigo, fonte, data) na linha do master novo.
- Detalhes do AWB: nova seção "Histórico de troca de master" listando antigo→novo, fonte, voo, rota, data.

## 5. Edge functions / proxy

- `mariadb-proxy` — novas actions:
  - `air_master_swap_list({ awbs })`
  - `air_master_swap_history({ awb })`
  - `air_master_discrepancy_list()`
  - `air_master_discrepancy_resolve({ id, awb_escolhido, user })`
- `air-detect-master-swap` (novo): executa §2.1, §2.2, replicação em `t_dados_aereo` quando origem = EXTRACTED_EMAILS, aplicação em `t_fato_aereo` via `last_status_code='DLV'` na linha antiga, e popula §3 para ambíguos.
- Cron: `*/30 * * * *` via `net.http_post` (inserido pela ferramenta de insert, não migração — segue padrão de cron jobs do projeto).

## 6. Memória de projeto

Adicionar `mem://air/tracking/master-swap-detection-v1` e referência em `mem://index.md`.

---

## Detalhes técnicos

- Comparações string com `COLLATE utf8mb4_unicode_ci`.
- `data_inclusao_nova` truncada ao segundo.
- HAWB normalizado (TRIM + UPPER).
- Detecção §2.2 idempotente por (`hawb`, `awb_novo`, `fonte`).
- Replicação em `t_dados_aereo` idempotente por (`hawb_number`, novo `awb`).
- `t_fato_aereo`: a única coluna alterada pelo swap é `last_status_code`='DLV' na linha do AWB antigo. Nenhum outro campo, em nenhuma linha, é alterado.

## Validação

1. `t_dados_aereo` com mesmo `id_olss` e datas diferentes → linha antiga em `t_fato_aereo` recebe `last_status_code='DLV'`, linha do AWB novo segue com badge "Troca de master".
2. Mesmo `id_olss` + mesma `data_inclusao_nova` + mesmo HAWB → entra em Críticos com "Discrepância de master"; ao resolver, AWBs descartados recebem `last_status_code='DLV'`, escolhido fica com badge.
3. Email com PDF MANIFEST com `mawb_number` diferente do atual → swap registrado com `fonte=EXTRACTED_EMAILS`; nova linha aparece em `t_dados_aereo` com `master_insert=NULL` e `created_at=now()`; linha antiga em `t_fato_aereo` vai para 'DLV'; badge "Troca de master" aparece no AWB novo.
4. Cron roda a cada 30 min sem duplicar histórico nem reaplicar 'DLV'.
