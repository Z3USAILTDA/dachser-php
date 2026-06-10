## Causa do erro

`/regua` e `/olimpo` quebraram com:
```
Unknown column 't.dataprevbaixa' in 'field list'
```

A view `dados_dachser.v_fin_regua_contas_receber` renomeia a coluna para `data_prev_baixa` (com underscores). A coluna `dataprevbaixa` existe na **tabela base** `t_dados_financeiro_contas_receber`. No ajuste anterior, troquei o nome para `dataprevbaixa` mantendo a query lendo da view — por isso quebrou.

A action `get_financeiro_nfs_stats_cr` continua funcionando porque só usa `datavalidade` (nome igual em ambas).

## Correção (cirúrgica)

Em `supabase/functions/mariadb-proxy/index.ts`, no bloco dos `_cr` (≈ linhas 17758–18402), trocar a origem das queries da view para a tabela base, para usar a coluna `dataprevbaixa` que a régua exige como verdade:

- `FROM dados_dachser.v_fin_regua_contas_receber t` → `FROM dados_dachser.t_dados_financeiro_contas_receber t`
- Manter as referências `t.dataprevbaixa` como já estão.
- Manter os mesmos filtros `NOT EXISTS` / `WHERE` existentes.
- Preservar o alias `AS data_vencimento` no SELECT para compatibilidade do frontend.
- `get_financeiro_nfs_stats_cr` (que agrega `MAX(datavalidade)`): também trocar para a tabela base — ambas têm `datavalidade`, mas a verdade temporal pedida vem da base.

Após editar: redeploy do `mariadb-proxy` e validação dos 4 endpoints `_cr` retornando `success:true`:
- `get_aging_overview_cr`
- `get_aging_by_client_cr`
- `get_aging_analitico_cr`
- `get_regua_cobranca_data_cr`
- `get_financeiro_nfs_stats_cr`

## Fora de escopo

Sem mudanças em UI, tipos, fluxo de voucher, esteira, RLS, banco ou autenticação.