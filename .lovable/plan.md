

## Plano: "Criado por" para voucher master deve vir do log MASTER_CRIADO

### Problema

Atualmente o COALESCE que popula `dfv_created_by` prioriza `dfv.created_by` (da `t_dados_financeiro_voucher`) para **todos** os vouchers, incluindo masters. Para vouchers master, o valor correto é o `user_name` do log com ação `MASTER_CRIADO` — ou seja, quem criou o master na esteira.

### Solução

Alterar o COALESCE nos 3 locais para usar um `CASE WHEN v.is_master = 1` que prioriza o log `MASTER_CRIADO` para masters e mantém a lógica atual para vouchers normais:

```sql
CASE 
  WHEN v.is_master = 1 THEN
    COALESCE(
      (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc
       WHERE lc.voucher_id = v.id AND lc.acao = 'MASTER_CRIADO'
       ORDER BY lc.data_hora ASC LIMIT 1),
      v.criado_por_user_id
    )
  ELSE
    COALESCE(
      dfv.created_by,
      (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc
       WHERE lc.voucher_id = v.id AND lc.acao = 'VOUCHER_CRIADO'
       ORDER BY lc.data_hora ASC LIMIT 1),
      v.criado_por_user_id
    )
END as dfv_created_by
```

### Alterações

**Arquivo: `supabase/functions/mariadb-proxy/index.ts`**

3 locais (linhas ~6363, ~13748, ~13783): Substituir o COALESCE atual pelo `CASE WHEN` acima.

Nenhuma alteração no frontend.

