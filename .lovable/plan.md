

## Plano: Preencher "Criado por" para todos os vouchers

### Diagnóstico

Existem **dois problemas** impedindo o "Criado por" de aparecer:

**Problema 1 — Vouchers "A Processar" (RM Pending):**
A query `combinedPendentes` (linha 13805) busca dados da `t_dados_financeiro_voucher` mas **não inclui a coluna `created_by`** no SELECT. O mapeamento no frontend (`mapRMPendingVoucher`, linha 790) também não define `criadoPorDfv`. Resultado: sempre vazio.

**Problema 2 — Vouchers Ativos com JOIN falhando:**
O JOIN usa `dfv.nd = v.numero_spo`, mas pode haver diferenças de formatação (espaços, prefixos) entre as duas colunas, fazendo o LEFT JOIN não encontrar correspondência. Adicionalmente, o COALESCE não tem fallback para `v.criado_por_user_id`.

### Alterações

**Arquivo: `supabase/functions/mariadb-proxy/index.ts`**

1. **Query `combinedPendentes`** (linha ~13805): Adicionar `dfv.created_by` ao SELECT dos vouchers pendentes RM.

2. **Queries `combinedAtivos` e `get_vouchers_esteira`**: Adicionar `v.criado_por_user_id` como fallback final no COALESCE, e aplicar `TRIM()` no JOIN para evitar problemas de espaços:
```sql
COALESCE(
  dfv.created_by,
  (SELECT lc.user_name FROM t_voucher_logs lc WHERE ... LIMIT 1),
  v.criado_por_user_id
) as dfv_created_by
```

**Arquivo: `src/pages/esteira/EsteiraIndex.tsx`**

3. **`mapRMPendingVoucher`** (linha ~808): Adicionar mapeamento de `criadoPorDfv: rm.created_by || null`.

### Resumo
| Local | Alteração |
|-------|-----------|
| `combinedPendentes` query | Adicionar `dfv.created_by` ao SELECT |
| `combinedAtivos` query | Adicionar `v.criado_por_user_id` como 3o fallback + TRIM no JOIN |
| `get_vouchers_esteira` query | Mesmo ajuste de fallback + TRIM |
| `mapRMPendingVoucher` | Mapear `criadoPorDfv` do campo `created_by` |

Nenhuma alteração de schema — apenas queries e mapeamento.

