# Consignee nulo em /sea/tracking

## Causa raiz

A tela carrega via `olimpo-proxy?action=get_sea_tracking`. Na query, o campo `consignee` é resolvido por:

```sql
COALESCE(
  NULLIF(TRIM(MAX(ts.consignee_nome)), ''),
  NULLIF(TRIM(MAX(ts.consignee)), ''),
  NULLIF(TRIM(MAX(mdn.cliente)), '')
) as consignee
```

Onde:
- `ts` = `t_sea_tracking_current` — `consignee_nome` raramente é populado; `consignee` é preenchido no sync.
- `mdn` = CTE sobre `t_dados_maritimo.consignee_nome` — só cobre MBLs cadastrados nessa tabela (export recente).

No `sync_sea_tracking`, quando o candidato vem de **`t_sea_master`** (fonte principal), o insert grava:

```sql
sm.customer_no AS consignee
```

`t_sea_master.customer_no` é um **código** (ex.: `0011223`), não o nome do cliente. Resultado:
- MBLs vindos de `t_sea_master`: `ts.consignee` contém um código ou vazio (quando `customer_no` é NULL no master).
- MBLs sem registro em `t_dados_maritimo`: o fallback `mdn.cliente` não resolve.
- Tela mostra `-` / null para todas essas linhas.

Já existe a tabela `t_clientes_base` (vista em `search_clientes_base`) com mapeamento `dchr_customer_number → nome_cliente`.

## Correção (cirúrgica, só leitura)

Arquivo único: `supabase/functions/olimpo-proxy/index.ts`, handler `get_sea_tracking`.

1. **Nova CTE** `master_customer` resolvendo o nome do cliente do `t_sea_master` via `t_clientes_base`:

   ```sql
   master_customer AS (
     SELECT
       TRIM(sm.master) AS mbl_id,
       MAX(cb.nome_cliente) AS cliente_nome
     FROM dados_dachser.t_sea_master sm
     LEFT JOIN dados_dachser.t_clientes_base cb
       ON cb.dchr_customer_number COLLATE utf8mb4_unicode_ci
        = sm.customer_no COLLATE utf8mb4_unicode_ci
       AND cb.ativo = 1
     WHERE sm.master IS NOT NULL
       AND TRIM(sm.master) != ''
       AND sm.customer_no IS NOT NULL
       AND TRIM(sm.customer_no) != ''
     GROUP BY TRIM(sm.master)
   )
   ```

2. **LEFT JOIN** dessa CTE pelo `mbl_id` (mesmo padrão de collate dos outros joins): `mc`.

3. **Atualizar o COALESCE** de `consignee` e o `cliente` (linhas ~2209 e ~2228) acrescentando `MAX(mc.cliente_nome)` no encadeamento, mantendo a ordem atual como prioridade:

   ```sql
   COALESCE(
     NULLIF(TRIM(MAX(ts.consignee_nome)), ''),
     -- ts.consignee só vale se NÃO for um código numérico puro (customer_no gravado pelo sync)
     CASE WHEN MAX(ts.consignee) REGEXP '^[0-9]+$' THEN NULL
          ELSE NULLIF(TRIM(MAX(ts.consignee)), '') END,
     NULLIF(TRIM(MAX(mdn.cliente)), ''),
     NULLIF(TRIM(MAX(mc.cliente_nome)), '')
   ) AS consignee
   ```

   E o `cliente` (linha 2228) recebe o mesmo fallback no final.

## Fora de escopo

- Não alterar o `sync_sea_tracking` (evita migração/backfill de dados existentes); a resolução fica no GET.
- Não mexer em UI, filtros, paginação, demais ações do proxy.
- Não criar/alterar índices nem schema.

## Risco

- Custo extra: 1 CTE adicional + 1 LEFT JOIN sobre `t_sea_master` (já é varrido em outras CTEs). Impacto desprezível.
- MBLs cujo `customer_no` não existe em `t_clientes_base` continuam null (não há fonte alternativa de nome para eles).
