## Problema

A ND **164714** (NF `000552473`, documento `000552473/01`, cliente SUMITOMO) está marcada como disputa em `ai_agente.t_fin_disputas` (`is_disputa=1`, `resolved_at=NULL`, `deleted_at=NULL`), mas não aparece como "Em disputa" em nenhuma tela do Olimpo/Régua de Cobrança.

## Causa raiz

A view `dados_dachser.v_fin_regua_contas_receber` expõe `doc_key` no formato **`CR|<idlan>`** (ex.: `CR|4453543`). Já `t_fin_disputas` (após o de-para correto aplicado em `save_disputa_cr`) grava as três chaves canônicas vindas de `t_dados_financeiro_contas_receber`:

- `documento` = `numerodocumento` (ex.: `000552473/01`)
- `nf` = `numero_nf` (ex.: `000552473`)
- `nd` = `segundonumero` (ex.: `164714`)

Mas o detector de disputa nas queries de aging/CNPJ/cliente faz o join assim:

```sql
EXISTS (
  SELECT 1 FROM ai_agente.t_fin_disputas d
  WHERE CONCAT(COALESCE(d.documento,''),'|',COALESCE(d.nf,'')) = t.doc_key
    AND d.is_disputa = 1 AND d.resolved_at IS NULL AND d.deleted_at IS NULL
)
```

`CONCAT('000552473/01','|','000552473')` ≠ `'CR|4453543'`. **Nenhuma** disputa nova bate — só registros legados com `documento='CR'` e `nf=<idlan>` casam.

## Correção

Trocar a cláusula `WHERE` do `EXISTS` nos 6 pontos abaixo de `supabase/functions/mariadb-proxy/index.ts` (linhas **18293, 18374, 18444, 18633, 18705, 18769**) pelo match das três colunas canônicas, com fallback para o formato legado `'CR'`:

```sql
WHERE (
  -- formato canônico atual (de-para com t_dados_financeiro_contas_receber)
  (
    COALESCE(d.documento,'') <> 'CR'
    AND d.documento     COLLATE utf8mb4_unicode_ci = t.documento     COLLATE utf8mb4_unicode_ci
    AND COALESCE(d.nf,'') COLLATE utf8mb4_unicode_ci = COALESCE(t.numero_nf,'') COLLATE utf8mb4_unicode_ci
    AND COALESCE(d.nd,'') COLLATE utf8mb4_unicode_ci = COALESCE(t.nd,'')        COLLATE utf8mb4_unicode_ci
  )
  OR
  -- legado órfão: documento='CR', nf=idlan -> casa com doc_key 'CR|<idlan>'
  (
    d.documento = 'CR'
    AND CONCAT('CR|', COALESCE(d.nf,'')) COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci
  )
)
AND d.is_disputa = 1
AND d.resolved_at IS NULL
AND d.deleted_at IS NULL
```

Mapeamento usado (conforme solicitado):

| t_fin_disputas | t_dados_financeiro_contas_receber / view | Exemplo       |
|----------------|------------------------------------------|---------------|
| `documento`    | `numerodocumento` (`v.documento`)        | `000552473/01`|
| `nf`           | `numero_nf` (`v.numero_nf`)              | `000552473`   |
| `nd`           | `segundonumero` (`v.nd`)                 | `164714`      |

## Pontos a alterar (mesmo padrão nos 6)

- 18293 — `get_aging_by_product_cr`
- 18374 — `get_aging_by_client_cr`
- 18444 — `get_client_cnpj_detail_cr`
- 18633 / 18705 / 18769 — demais agregações CR (totais, aging por CNPJ e variantes)

## Validação após o deploy

1. `get_client_cnpj_detail_cr` para SUMITOMO → `disputa_count ≥ 1` e `disputa_total ≥ 41.645,10`.
2. `/olimpo/cobranca`: SUMITOMO mostra "Em disputa" e a ND **164714** aparece ao expandir as disputas do CNPJ.
3. Totais `disp_*` em `get_aging_by_client_cr` refletem disputas que estavam ocultas.

## Fora do escopo

- Não alterar `save_disputa_cr` (de-para já correto).
- Não alterar `get_disputas` / `get_disputas_cr` (já leem direto de `t_fin_disputas`).
- Não alterar a view `v_fin_regua_contas_receber`.
- Nenhuma mudança em UI ou outros módulos.
