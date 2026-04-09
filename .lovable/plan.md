

## Plano: Garantir que `created_by` da `t_dados_financeiro_voucher` popule a coluna "Criado por"

### Problema
A subquery que busca `created_by` usa `MIN(created_by)`, que retorna NULL quando o registro com menor valor alfabético é NULL (mesmo que outros registros do mesmo `nd` tenham o campo preenchido). Além disso, vouchers sem registro na `t_dados_financeiro_voucher` ficam sem valor.

### Solução
Trocar `MIN(created_by)` por `MAX(created_by)` nas 3 queries que fazem esse JOIN. O `MAX` prioriza valores não-nulos sobre NULL no MySQL/MariaDB, garantindo que se houver pelo menos um registro com `created_by` preenchido, ele será retornado.

### Alterações

**Arquivo: `supabase/functions/mariadb-proxy/index.ts`**

3 locais (queries `get_vouchers_esteira`, `get_vouchers_ativos`, `get_vouchers_combined`):

```sql
-- DE:
MIN(created_by) as created_by

-- PARA:
MAX(created_by) as created_by
```

Linhas aproximadas: 6380, 13761, 13795.

Nenhuma alteração no frontend — apenas a agregação no backend será ajustada para priorizar valores preenchidos.

