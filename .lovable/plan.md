

## Fix: Client View in Olimpo Cobranca

**Problem**: The "Client" tab shows no data because the SQL query references a non-existent column `nome_cliente`. The correct column in `t_dados_financeiro_nfs` is `razao_social`. Additionally, client names should be truncated at the first "-" for cleaner display.

---

### Changes

**1. Update SQL query in `mariadb-proxy/index.ts` (line ~2156)**

Replace `t.nome_cliente` with `t.razao_social` and apply `SUBSTRING_INDEX` to truncate at the first "-":

```sql
SELECT
  TRIM(SUBSTRING_INDEX(COALESCE(t.razao_social, 'Sem Cliente'), '-', 1)) AS product,
  ...
GROUP BY TRIM(SUBSTRING_INDEX(COALESCE(t.razao_social, 'Sem Cliente'), '-', 1))
ORDER BY SUM(t.valor_nf) DESC
```

This single change:
- Fixes the column reference from `nome_cliente` to `razao_social`
- Truncates names at the first "-" (e.g., "THYSSENKRUPP BRASIL - THYSSENKRUPP BRASIL LTDA." becomes "THYSSENKRUPP BRASIL")
- Trims trailing whitespace after the split
- Groups correctly by the truncated name so records for the same client are consolidated

**Files modified**: `supabase/functions/mariadb-proxy/index.ts` (2 lines in the SQL query)

