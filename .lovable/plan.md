
## Objetivo

Aplicar a regra única de identidade SPO/ND **em todos os pontos** que cruzam `t_vouchers.numero_spo` com `t_dados_financeiro_voucher.nd` (ou comparam ND livre):

> Identidade = prefixo numérico antes do primeiro espaço. Ignorar sufixos como ` DIM-BY`, ` SAN`, etc.

Helper SQL padrão (usado nos dois lados da comparação):

```sql
SUBSTRING_INDEX(TRIM(x), ' ', 1) COLLATE utf8mb4_unicode_ci
```

## Pontos a alterar em `supabase/functions/mariadb-proxy/index.ts`

Todos passam a usar a normalização por prefixo, em vez de `TRIM(x) = TRIM(y)` ou `x = y`:

| # | Linha aprox. | Contexto | Mudança |
|---|---|---|---|
| 1 | 7500 | JOIN exclusão ADM (get_vouchers / list) | JOIN por prefixo |
| 2 | 10461 | `check_voucher_rm_ready` (gate de avanço) | `WHERE` por prefixo (1 param) |
| 3 | 10600 | `NOT EXISTS` ADM em filtros | comparação por prefixo |
| 4 | 11588 | JOIN de listagem | JOIN por prefixo |
| 5 | 11624 | JOIN de listagem | JOIN por prefixo |
| 6 | 11847-11852 | `find_voucher_multi.tryByNd` | JOIN+WHERE por prefixo |
| 7 | 12123-12129 | `find_voucher_by_nd` | JOIN+WHERE por prefixo |
| 8 | 12482 | LEFT JOIN (vouchers ausentes em t_vouchers) | JOIN por prefixo |
| 9 | 12652 | `SELECT id_rm ... WHERE nd = ?` | `WHERE prefix(nd)=prefix(?)` |
| 10 | 13134 | LEFT JOIN agregada | JOIN por prefixo |
| 11 | 13559 | LEFT JOIN agregada | JOIN por prefixo |
| 12 | 15908 | Sync incremental | JOIN por prefixo |
| 13 | 16007 | Auto-fill após criação | JOIN por prefixo |
| 14 | 16115 | JOIN exclusão ADM | JOIN por prefixo |
| 15 | 16186 | JOIN exclusão ADM | JOIN por prefixo |
| 16 | 16205 | LEFT JOIN sync | JOIN por prefixo |
| 17 | 16300 | JOIN sync | JOIN por prefixo |
| 18 | 18775 / 18801 | Lookups por nd em ações de tela | `WHERE prefix(nd)=prefix(?)` |
| 19 | 19557 | LEFT JOIN listagem | JOIN por prefixo |

Padrão exato aplicado a JOINs:

```sql
ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_unicode_ci
 = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci
```

Padrão para WHERE com parâmetro:

```sql
WHERE SUBSTRING_INDEX(TRIM(nd), ' ', 1) COLLATE utf8mb4_unicode_ci
    = SUBSTRING_INDEX(TRIM(?), ' ', 1) COLLATE utf8mb4_unicode_ci
```

Cobre todas as combinações:
- `'105-293596'` ↔ `'105-293596'`
- `'105-293596 DIM-BY'` ↔ `'105-293596'`
- `'105-293596'` ↔ `'105-293596 DIM-BY'`
- `'105-293596 DIM-BY'` ↔ `'105-293596 DIM-BY'`

## Memória do projeto

Atualizar `mem://vouchers/check-rm-ready-only-blocks-manual` (ou criar `mem://vouchers/spo-nd-prefix-identity-rule`) com a regra única: **comparação SPO↔ND sempre por prefixo antes do primeiro espaço, em ambos os lados**, e listar os pontos cobertos.

## Fora de escopo

- Sem migração de schema. Sem coluna normalizada. Sem backfill.
- Não tocar em fluxos de comprovante além das funções já listadas (`find_voucher_multi`, `find_voucher_by_nd`).
- Não mexer em índices (a função `SUBSTRING_INDEX` invalida índice em `nd`, mas a tabela é pequena no contexto dessas queries — performance permanece aceitável; se virar gargalo no futuro, abre-se uma tarefa separada para coluna gerada `nd_key`).

## Risco

Possível leve aumento de custo nos JOINs por full scan em `dfv.nd`. Aceitável dado o volume atual e a criticidade de não bloquear avanço de etapa nem perder match de comprovante.

Posso aplicar?
