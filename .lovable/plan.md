## Objetivo

Garantir que `t_vouchers` **nunca** divirja de `t_dados_financeiro_voucher` (dfv) nas colunas de origem do dado financeiro. O dfv passa a ser fonte da verdade, casado por `id_rm`.

## Campos espelhados (sempre sobrescritos pelo dfv)

| t_vouchers | ← origem em t_dados_financeiro_voucher |
|---|---|
| `fornecedor` | `nome_beneficiario` (fallback `razao_social`) |
| `cnpj_fornecedor` | `cnpj` |
| `valor` | `valor_nf` |
| `data_emissao_documento` | `data_emissao` |
| `processo_id` | `numero_processo` |
| `filial` | `nome_cobranca` |

## Campos protegidos (nunca tocados pelo sync)

`moeda` (pode ser ajustada pelo usuário no cadastro), `etapa_atual`, `status_baixa`, `status_financeiro`, `status_envio_cliente`, `status_pagamento`, `status_documento_fiscal`, `status_comprovante`, `status_integracao_rm`, `comentarios_*`, `ajuste_*`, `urgencia_tipo`, `urgente`, `responsavel_*_user_id`, `aprovado_por_user_id`, `cobranca_em_nome_de`, `forma_pagamento`, `vencimento`, `tipo_documento`, `tipo_execucao_pagamento`, `is_master`, `voucher_master_id`, anexos.

## Regra de match (chave autoritativa)

1. `t_vouchers.id_rm IS NOT NULL` → `JOIN dfv ON dfv.id_rm = v.id_rm` (1‑para‑1, sem ambiguidade).
2. `id_rm IS NULL` (voucher manual ainda sem RM) → match por `SUBSTRING_INDEX(nd,' ',1) = SUBSTRING_INDEX(numero_spo,' ',1)`. No primeiro enrich, gravar o `id_rm` no voucher para que dali em diante use a regra 1.

## Mudanças

### 1. Edge function `mariadb-proxy` (`supabase/functions/mariadb-proxy/index.ts`)

**a. Novo case `mirror_vouchers_from_dfv`** (executável on‑demand e via cron):

```sql
-- (a) Vouchers com id_rm: espelho 1:1 (sempre sobrescreve)
UPDATE dados_dachser.t_vouchers v
JOIN dados_dachser.t_dados_financeiro_voucher dfv ON dfv.id_rm = v.id_rm
SET v.fornecedor              = COALESCE(NULLIF(TRIM(dfv.nome_beneficiario),''), NULLIF(TRIM(dfv.razao_social),''), v.fornecedor),
    v.cnpj_fornecedor         = COALESCE(NULLIF(TRIM(dfv.cnpj),''), v.cnpj_fornecedor),
    v.valor                   = COALESCE(dfv.valor_nf, v.valor),
    v.data_emissao_documento  = COALESCE(dfv.data_emissao, v.data_emissao_documento),
    v.processo_id             = COALESCE(NULLIF(TRIM(dfv.numero_processo),''), v.processo_id),
    v.filial                  = COALESCE(NULLIF(TRIM(dfv.nome_cobranca),''), v.filial),
    v.updated_at              = NOW()
WHERE v.sync_status = 'ATIVO'
  AND v.etapa_atual NOT IN ('CONCLUIDO','CANCELADO');

-- (b) Vouchers manuais sem id_rm: enrich + grava id_rm para virar 1:1 daqui pra frente.
--     Só age quando o nd aponta para um único id_rm (sem ambiguidade).
UPDATE dados_dachser.t_vouchers v
JOIN (
  SELECT MIN(id_rm) AS id_rm,
         SUBSTRING_INDEX(TRIM(nd),' ',1) AS nd_norm
  FROM dados_dachser.t_dados_financeiro_voucher
  GROUP BY SUBSTRING_INDEX(TRIM(nd),' ',1)
  HAVING COUNT(DISTINCT id_rm) = 1
) m ON m.nd_norm = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
JOIN dados_dachser.t_dados_financeiro_voucher dfv ON dfv.id_rm = m.id_rm
SET v.id_rm                   = dfv.id_rm,
    v.fornecedor              = COALESCE(NULLIF(TRIM(dfv.nome_beneficiario),''), NULLIF(TRIM(dfv.razao_social),''), v.fornecedor),
    v.cnpj_fornecedor         = COALESCE(NULLIF(TRIM(dfv.cnpj),''), v.cnpj_fornecedor),
    v.valor                   = COALESCE(dfv.valor_nf, v.valor),
    v.data_emissao_documento  = COALESCE(dfv.data_emissao, v.data_emissao_documento),
    v.processo_id             = COALESCE(NULLIF(TRIM(dfv.numero_processo),''), v.processo_id),
    v.filial                  = COALESCE(NULLIF(TRIM(dfv.nome_cobranca),''), v.filial),
    v.updated_at              = NOW()
WHERE (v.id_rm IS NULL OR v.id_rm = '')
  AND v.sync_status = 'ATIVO'
  AND v.etapa_atual NOT IN ('CONCLUIDO','CANCELADO');
```

Retorno: `{ updated_with_idrm, enriched_manual, ambiguous_pending: [...] }` (lista os SPOs cujo `nd` casa com mais de um `id_rm`, para auditoria).

**b. Ajustes nas writes existentes:**

- `sync_vouchers_incremental` (insert inicial, linha 16034): adicionar `filial` e gravar `rm.nome_cobranca`.
- Bloco "ENRICH MANUAL" (linha 16079): substituir o match ambíguo por `nd` pela regra (b) acima e incluir `filial`. **Não** mexer em `moeda` (continua respeitando o que o usuário cadastrou).
- Demais `INSERT INTO t_vouchers` (linhas 6496, 12809, 13270, 13365, 19688): conferir e adicionar `filial` quando a origem for RM.

**c. `get_vouchers_combined` (linha 16223):** depois do mirror, os campos já estão em `v.*`. Remover a regra "pegar o nome mais longo" e os fallbacks de `dfv_*` no frontend.

### 2. Backfill imediato (uma vez)

Rodar `mirror_vouchers_from_dfv` para corrigir os 311 vouchers sem filial, o SPO 20261883397 sem CNPJ e os 27 vouchers com fornecedor incorreto/abreviado.

### 3. Agendamento

Adicionar `mirror_vouchers_from_dfv` ao cron de 1 minuto que já roda `sync_voucher_statuses` (mesma janela).

### 4. Frontend (limpeza)

- `src/pages/esteira/EsteiraVoucherDetails.tsx` (linhas 88–105): remover `sort by length` do fornecedor e os fallbacks `dfv_cnpj` / `dfv_nome_cobranca`. Voltar a ler direto de `data.fornecedor`, `data.cnpj_fornecedor`, `data.filial`. **Manter `data.moeda` como está** (vem de t_vouchers, que é o que o usuário cadastrou).
- `src/pages/esteira/EsteiraIndex.tsx` (linhas 767 e 978): mesma limpeza.

### 5. Casos residuais

- **SPO 20261567059** continua sem `processo` (não há linha em dfv). Estado vazio na UI; ação operacional.
- Vouchers cujo `nd` casa com vários `id_rm` distintos ficam de fora do enrich automático (regra b) e aparecem em `ambiguous_pending` no log do mirror.

## Detalhes técnicos

- Sem mudança de schema; apenas DML em MariaDB.
- Mantém COLLATE `utf8mb4_unicode_ci` nos JOINs.
- Não toca em `auth.users`, RLS ou tabelas Supabase.
- Atualizar memória do projeto: nova entrada **t_vouchers ↔ dfv mirroring rule** (id_rm como chave; `moeda` protegida por ser editável pelo usuário).

## Validação pós‑implementação

1. Rodar `mirror_vouchers_from_dfv`.
2. Re‑executar o script de QA: esperado 0 vouchers com filial/cnpj/fornecedor divergentes.
3. Conferir manualmente SPO 20261567041 (LUFTHANSA), SPO 20261883397 (DTA) e SPO 20262162097 — devem refletir o que está em dfv para o `id_rm` deles, e a moeda deve continuar a do cadastro.