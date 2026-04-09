

## Plano: Excluir NFs da régua de cobrança do Histórico de Baixas

### Problema
O Histórico de Baixas mostra registros da `tbaixas` que também existem na `t_dados_financeiro_nfs` (régua de cobrança). Esses registros de NF já são gerenciados na régua e não devem aparecer duplicados no histórico.

### Solução
Adicionar um `LEFT JOIN` + filtro `IS NULL` na query do backend para excluir registros cuja `IdLancamentoRM` exista na `t_dados_financeiro_nfs`.

### Alteração

**Arquivo: `supabase/functions/mariadb-proxy/index.ts`** (action `get_historico_baixas`, ~linha 10363)

Alterar a query de busca das baixas de:
```sql
SELECT ...
FROM dados_dachser.tbaixas b
WHERE b.StatusLan IN (0, 1, 2, 3) ...
```

Para:
```sql
SELECT ...
FROM dados_dachser.tbaixas b
LEFT JOIN dados_dachser.t_dados_financeiro_nfs nfs 
  ON nfs.id_rm = b.IdLancamentoRM
WHERE b.StatusLan IN (0, 1, 2, 3) 
  AND nfs.id_rm IS NULL
  ...
```

Isso exclui qualquer baixa cujo `IdLancamentoRM` tenha correspondência na tabela de NFs da régua de cobrança, mantendo apenas as baixas de vouchers.

Nenhuma alteração no frontend — apenas a query do backend será ajustada.

