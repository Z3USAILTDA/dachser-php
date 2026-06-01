
## Objetivo

Dividir a origem de dados da esteira em duas fontes distintas no MariaDB, considerando a coluna `detalhes` (lista de processos associados) presente em `t_dados_financeiro_spo`:

- `t_dados_financeiro_spo` → registros do tipo **SPO** (nd no formato `XXX-...`, onde `XXX` é a filial). Pode conter múltiplos processos em `detalhes`, separados por `;`.
- `t_dados_financeiro_voucher` → registros do tipo **Voucher** (demais).

E ajustar a importação em lote de SPO para buscar pelo **processo** contra `t_dados_financeiro_spo.numero_processo` (com fallback em `detalhes`), em vez do número do SPO da planilha contra `nd`.

## Premissa

`t_dados_financeiro_spo` já existe no MariaDB com colunas equivalentes às de `t_dados_financeiro_voucher` (`id_rm, nd, documento, nome_beneficiario, nome_cobranca, numero_nf, numero_processo, modal, tipo_pag, forma_pag, data_emissao, data_vencimento, valor_nf, moeda, cnpj, razao_social, created_by`), **acrescida da coluna `detalhes`** (TEXT, lista de processos separada por `;`, ex.: `BSSZDEX26050112;BSSZDEX26050113;...`).

Regra de tipo (usada em todas as queries):

```sql
-- SPO: nd começa com prefixo "NN-", "NNN-" ou "NNNN-" (filial + hífen)
SUBSTRING_INDEX(TRIM(nd), ' ', 1) REGEXP '^[0-9]{2,4}-'
```

---

## 1. Aba "A processar" — `get_vouchers_pendentes_rm`

Arquivo: `supabase/functions/mariadb-proxy/index.ts` (case `get_vouchers_pendentes_rm`).

Trocar a query única atual por um `UNION ALL` das duas fontes, com **prioridade ao SPO** quando o mesmo processo existir em ambas. Trazer `detalhes` no SELECT do SPO (e `NULL AS detalhes` no voucher) para a UI poder expandir os processos associados.

```sql
WITH spo AS (
  SELECT 'SPO' AS source, dfs.id_rm, dfs.nd, dfs.documento, dfs.nome_beneficiario,
         dfs.nome_cobranca, dfs.numero_nf, dfs.numero_processo, dfs.modal,
         dfs.tipo_pag, dfs.forma_pag, dfs.data_emissao, dfs.data_vencimento,
         dfs.valor_nf, dfs.moeda, dfs.cnpj, dfs.razao_social, dfs.created_by,
         dfs.detalhes
    FROM dados_dachser.t_dados_financeiro_spo dfs
   WHERE (dfs.nome_beneficiario IS NULL OR LOWER(dfs.nome_beneficiario) NOT LIKE '%dachser%')
     AND (dfs.modal IS NULL OR dfs.modal <> 'ADM')
),
voucher AS (
  SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, ... , NULL AS detalhes
    FROM dados_dachser.t_dados_financeiro_voucher dfv
   WHERE (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%')
     AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
),
unified AS (
  SELECT * FROM spo
  UNION ALL
  SELECT v.* FROM voucher v
   WHERE NOT EXISTS (
     SELECT 1 FROM spo s
      WHERE s.numero_processo IS NOT NULL
        AND s.numero_processo COLLATE utf8mb4_unicode_ci
          = v.numero_processo COLLATE utf8mb4_unicode_ci
   )
)
SELECT u.*
  FROM unified u
  LEFT JOIN dados_dachser.t_vouchers v
         ON SUBSTRING_INDEX(TRIM(u.nd),' ',1) COLLATE utf8mb4_unicode_ci
          = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
  LEFT JOIN dados_dachser.tbaixas b ON u.id_rm = b.IdLancamentoRM
 WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL
 ORDER BY u.data_vencimento ASC;
```

No backend, normalizar a resposta para incluir:
- `source: 'SPO' | 'VOUCHER'`
- `processos_associados: string[]` — derivado de `detalhes.split(';')` (trim + filter vazios + dedupe), apenas para `source='SPO'`.

---

## 2. UI da aba "A processar" — `BacklogTab.tsx`

Mudanças mínimas, sem alterar layout geral:

- Adicionar um badge discreto "SPO" / "Voucher" ao lado do `nd` (usa `source`).
- Quando `source='SPO'` e `processos_associados.length > 1`, exibir um ícone/contador clicável (ex.: `+N processos`) que abre um pequeno popover/expansão na linha listando todos os processos da coluna `detalhes`. O `numero_processo` principal continua sendo mostrado na coluna atual.
- Nenhuma mudança nas colunas existentes nem nas estatísticas do topo.

---

## 3. `import_voucher_from_rm` (botão "Importar" do backlog)

Arquivo: `mariadb-proxy/index.ts`.

Hoje resolve `id_rm` e busca `rmData` somente em `t_dados_financeiro_voucher`. Trocar por roteamento por tipo:

- Se `nd` casa com regex SPO → buscar em `t_dados_financeiro_spo` (selecionando também `detalhes`).
- Senão → buscar em `t_dados_financeiro_voucher`.
- Tie-breaker (nd ambíguo): aplicar mesma prioridade — SPO primeiro, voucher como fallback.

O insert em `t_vouchers` permanece igual. Se vier de SPO e `detalhes` tiver múltiplos processos, gravar a lista em `t_vouchers.processos_associados` (campo JSON/TEXT já existente ou criado via migration separada se ausente — confirmar antes de executar; fora deste plano se exigir schema change). Caso não exista hoje, gravar apenas o `numero_processo` principal e manter `detalhes` acessível via re-leitura da fonte.

---

## 4. Importação em lote de SPO (planilha)

Arquivos:
- `supabase/functions/mariadb-proxy/index.ts` — `fetchDfvBySpo` e `buildPreviewItems`.
- `src/components/esteira/BatchImportVoucherDialog.tsx` (apenas rótulos/mensagens se necessário).

**Mudança de chave de busca**: hoje normaliza `sheet.spo` e busca `WHERE UPPER(TRIM(nd)) IN (...)` em `t_dados_financeiro_voucher`. Trocar para buscar em `t_dados_financeiro_spo` pelo **processo da planilha** contra `numero_processo` **e** contra cada token de `detalhes`:

```sql
SELECT id_rm, nd, nome_beneficiario, nome_cobranca, numero_processo,
       modal, tipo_pag, forma_pag, data_emissao, data_vencimento,
       valor_nf, moeda, cnpj, razao_social, detalhes
  FROM dados_dachser.t_dados_financeiro_spo
 WHERE UPPER(TRIM(numero_processo)) COLLATE utf8mb4_unicode_ci
       IN (UPPER(TRIM(?)) COLLATE utf8mb4_unicode_ci, ...)
    OR EXISTS (
      SELECT 1
        FROM JSON_TABLE(
          CONCAT('["', REPLACE(detalhes, ';', '","'), '"]'),
          '$[*]' COLUMNS (p VARCHAR(64) PATH '$')
        ) jt
       WHERE UPPER(TRIM(jt.p)) COLLATE utf8mb4_unicode_ci
             IN (UPPER(TRIM(?)) COLLATE utf8mb4_unicode_ci, ...)
    )
```

Alternativa mais simples e portável (sem `JSON_TABLE`): usar `FIND_IN_SET` após substituir `;` por `,`:

```sql
... OR FIND_IN_SET(
        UPPER(TRIM(?)) COLLATE utf8mb4_unicode_ci,
        UPPER(REPLACE(detalhes, ';', ',')) COLLATE utf8mb4_unicode_ci
      ) > 0
```

Indexar `byProcesso[normProcesso(...)] = r` cobrindo tanto `numero_processo` quanto cada token de `detalhes`. Em `buildPreviewItems`, o lookup passa a usar `sheet.processo` como chave (não mais `sheet.spo`). O campo SPO da planilha continua sendo gravado como `numero_spo` do voucher resultante.

Remover a segunda passada por prefixo `spoPrefix` — desnecessária com casamento direto por processo. Validações da planilha continuam exigindo SPO e processo; apenas o **lookup** muda.

---

## 5. Fora de escopo

- Sem alteração de schema (assume-se que `t_dados_financeiro_spo` e a coluna `detalhes` já existem).
- Demais ações (`get_historico_baixas`, `get_baixas_sem_voucher`, sync incremental, etc.) continuam lendo de `t_dados_financeiro_voucher`.

## 6. Validação

- Aba "A processar": registros SPO trazem badge "SPO"; com `detalhes` populado, mostram contador de processos expansível.
- Processo presente em ambas as fontes aparece uma única vez, vindo do SPO.
- Importar item SPO do backlog → cria voucher em `t_vouchers` com dados de `t_dados_financeiro_spo`; lista de `detalhes` preservada/exibível.
- Importar planilha SPO → cada linha casa contra `t_dados_financeiro_spo.numero_processo` **ou** contra qualquer processo de `detalhes`.
