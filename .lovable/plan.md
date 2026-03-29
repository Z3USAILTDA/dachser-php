

## Corrigir erro de collation no JOIN do CCT

### Causa raiz

Linha 3567 do `mariadb-proxy/index.ts`:
```sql
ON TRIM(a.hawb) = TRIM(c.hawb)
```

As tabelas `t_cct_hawb_api_atual` e `t_dados_aereo` usam collations diferentes (`utf8mb4_general_ci` vs `utf8mb4_unicode_ci`), causando o erro "Illegal mix of collations" na comparação.

### Correção

**1 arquivo:** `supabase/functions/mariadb-proxy/index.ts`

Alterar a linha 3567 para forçar collation explícita:

```sql
ON TRIM(a.hawb) COLLATE utf8mb4_unicode_ci = TRIM(c.hawb) COLLATE utf8mb4_unicode_ci
```

Nada mais muda.

