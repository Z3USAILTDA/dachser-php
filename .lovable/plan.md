## Fase 3.1 — Endpoints shadow read-only (com ajustes aprovados)

Arquivo único alterado: `supabase/functions/mariadb-proxy/index.ts`. Sem schema, sem writes, sem tocar em endpoints existentes, frontend, regua-send-aging, regua-send-emails ou Olimpo.

### 1) Whitelist (linha 506)

Adicionar `get_disputas_cr` e `lookup_documento_cr` na lista de actions permitidas. Nenhuma remoção.

### 2) Novo case `get_disputas_cr`

Body: `{ tipo?: 'À vista' | 'A prazo' }`.

Estratégia: montar candidatos `(fd, v)` e **deduplicar por `fd.id`** com `ROW_NUMBER() OVER (PARTITION BY fd.id ORDER BY v.data_vencimento ASC, v.idlan ASC) = 1`. Cada disputa aparece no máximo uma vez.

```sql
WITH fd_ativas AS (
  SELECT fd.*
  FROM ai_agente.t_fin_disputas fd
  WHERE fd.is_disputa = 1
    AND fd.resolved_at IS NULL
    AND fd.deleted_at  IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM ai_agente.t_financeiro_soft_delete sd
      WHERE sd.documento COLLATE utf8mb4_unicode_ci
            = fd.nf       COLLATE utf8mb4_unicode_ci
        AND sd.active = 0
    )
),
candidatos AS (
  -- Bloco A: nova_base (CR|idlan)
  SELECT fd.id AS fd_id, fd.nf AS fd_nf, fd.responsavel AS fd_responsavel,
         fd.departamento, fd.observacoes, fd.escalation, fd.created_at AS fd_created_at,
         v.doc_key, v.idlan, v.id_rm, v.documento, v.numero_nf, v.nd,
         v.razao_social AS cliente, v.data_emissao, v.data_vencimento,
         v.valor_nf, v.tipo_documento, v.modal,
         'nova_base' AS origem_disputa
  FROM fd_ativas fd
  JOIN dados_dachser.v_fin_regua_contas_receber v
    ON v.doc_key COLLATE utf8mb4_unicode_ci
       = fd.nf   COLLATE utf8mb4_unicode_ci
  WHERE fd.nf LIKE 'CR|%'

  UNION ALL

  -- Bloco B: legado_casado (chave antiga match por SUBSTRING)
  SELECT fd.id, fd.nf, fd.responsavel,
         fd.departamento, fd.observacoes, fd.escalation, fd.created_at,
         v.doc_key, v.idlan, v.id_rm, v.documento, v.numero_nf, v.nd,
         v.razao_social, v.data_emissao, v.data_vencimento,
         v.valor_nf, v.tipo_documento, v.modal,
         'legado_casado'
  FROM fd_ativas fd
  JOIN dados_dachser.v_fin_regua_contas_receber v
    ON (
         SUBSTRING_INDEX(fd.nf,'|',1) COLLATE utf8mb4_unicode_ci = v.documento  COLLATE utf8mb4_unicode_ci
      OR SUBSTRING_INDEX(fd.nf,'|',1) COLLATE utf8mb4_unicode_ci = v.numero_nf  COLLATE utf8mb4_unicode_ci
      OR SUBSTRING_INDEX(fd.nf,'|',1) COLLATE utf8mb4_unicode_ci = v.nd         COLLATE utf8mb4_unicode_ci
    )
   WHERE fd.nf NOT LIKE 'CR|%'
),
dedup AS (
  SELECT c.*,
         ROW_NUMBER() OVER (PARTITION BY c.fd_id
                            ORDER BY c.data_vencimento ASC, c.idlan ASC) AS rn
  FROM candidatos c
),
casadas AS (
  SELECT * FROM dedup WHERE rn = 1
),
orfas AS (
  -- Bloco C: legado_orfao (sem nenhum match na view)
  SELECT fd.id AS fd_id, fd.nf AS fd_nf, fd.responsavel AS fd_responsavel,
         fd.departamento, fd.observacoes, fd.escalation, fd.created_at AS fd_created_at,
         fd.nf AS doc_key, NULL AS idlan, NULL AS id_rm,
         NULL AS documento, NULL AS numero_nf, NULL AS nd,
         fd.cliente AS cliente, NULL AS data_emissao, NULL AS data_vencimento,
         NULL AS valor_nf, NULL AS tipo_documento, NULL AS modal,
         'legado_orfao' AS origem_disputa, 1 AS rn
  FROM fd_ativas fd
  WHERE NOT EXISTS (SELECT 1 FROM casadas k WHERE k.fd_id = fd.id)
),
todas AS (
  SELECT * FROM casadas
  UNION ALL
  SELECT * FROM orfas
  /* orfas só são incluídas se ?tipoFilter? = NULL — aplicado em WHERE final */
)
SELECT
  doc_key,
  COALESCE(NULLIF(numero_nf,''), NULLIF(documento,''), NULLIF(nd,''), fd_nf) AS nf,
  nd,
  SUBSTRING_INDEX(cliente,' - ',1) AS razao_base,
  cliente,
  DATE_FORMAT(data_emissao,    '%Y-%m-%dT%H:%i:%s-03:00') AS emissao,
  DATE_FORMAT(data_vencimento, '%Y-%m-%dT%H:%i:%s-03:00') AS vencimento,
  valor_nf AS valor,
  CASE WHEN tipo_documento='FAT_NF' THEN 'À vista'
       WHEN tipo_documento IS NULL  THEN NULL
       ELSE 'A prazo' END AS tipo,
  fd_responsavel AS responsavel,
  observacoes,
  departamento,
  escalation,
  DATE_FORMAT(fd_created_at, '%Y-%m-%dT%H:%i:%s-03:00') AS created_at,
  origem_disputa,
  id_rm,
  idlan
FROM todas
WHERE 1=1
  /* se tipo informado: filtra e exclui órfãos */
  -- AND tipo_documento IS NOT NULL AND CASE WHEN tipo_documento='FAT_NF' THEN 'À vista' ELSE 'A prazo' END = ?
ORDER BY fd_created_at DESC, cliente ASC;
```

**Filtro `tipo` (regra aprovada)**:
- `tipo` ausente ⇒ sem WHERE adicional ⇒ casadas + órfãs.
- `tipo` informado ⇒ adicionar `AND tipo_documento IS NOT NULL AND CASE WHEN tipo_documento='FAT_NF' THEN 'À vista' ELSE 'A prazo' END = ?` ⇒ exclui automaticamente órfãos (que têm `tipo_documento` NULL). Não inventar tipo a partir de `fd`.

Retorno: `{ success: true, rows }`. Log: `Disputas CR loaded: <n> (nova=<a>, legado_casado=<b>, orfao=<c>)`.

### 3) Novo case `lookup_documento_cr`

Body: `{ nd?: string }` (aceita documento, numero_nf ou nd).

```sql
SELECT
  doc_key, idlan, id_rm, documento, numero_nf, nd,
  razao_social AS cliente, cnpj,
  DATE_FORMAT(data_vencimento,'%Y-%m-%d') AS vencimento,
  valor_nf AS valor,
  CASE WHEN tipo_documento='FAT_NF' THEN 'À vista' ELSE 'A prazo' END AS tipo,
  modal, processo, master, house
FROM dados_dachser.v_fin_regua_contas_receber
WHERE documento = ? OR numero_nf = ? OR nd = ?
ORDER BY data_vencimento ASC, idlan ASC
```

Sem `LIMIT`. Vazio ⇒ 404 `{ success:false, error:'Documento não encontrado' }`. OK ⇒ `{ success:true, rows }` (array — múltiplos idlan permitidos aqui).

### Garantias

- Não toca `get_disputas`, `lookup_documento`, `save_disputa`, `delete_*`, `resolve_*`, `bulk_*`, `update_disputa_*`, `import_disputas_planilha`, `check_disputas_planilha`.
- Não referencia `t_dados_financeiro_nfs`.
- Apenas `SELECT`. Sem writes. Sem schema change.
- Todas comparações com `fd.nf`, `sd.documento`, `v.doc_key`, `v.documento`, `v.numero_nf`, `v.nd` usam `COLLATE utf8mb4_unicode_ci` em ambos lados.
- Dedup por `fd.id` garante 1 linha por disputa em `get_disputas_cr`.

### Deploy + validação (via `curl_edge_functions` action `get_disputas_cr` / `lookup_documento_cr`)

1. `get_disputas_cr` sem `tipo` ⇒ 200, rows com 3 valores possíveis de `origem_disputa`.
2. `get_disputas_cr` `{tipo:'À vista'}` ⇒ 200, sem órfãos.
3. `get_disputas_cr` `{tipo:'A prazo'}` ⇒ 200, sem órfãos.
4. Contagem de `fd_id` distintos = total de rows (sem duplicidade).
5. `lookup_documento_cr` com `nd` real ⇒ ≥1 row com `doc_key` no formato `CR|<idlan>`.
6. `lookup_documento_cr` com termo inexistente ⇒ 404.
7. Logs sem referência a `t_dados_financeiro_nfs` nos novos cases.
