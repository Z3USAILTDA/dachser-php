## Problema

Na tela `/fin/disputa`, ao salvar uma disputa (ações `save_disputa_cr` e `save_disputa_cr_bulk` em `supabase/functions/mariadb-proxy/index.ts`), o backend grava em `ai_agente.t_fin_disputas` usando o split do `doc_key` ("CR|<nf>"), resultando em:

- `documento = "CR"` (literal, errado)
- `nf = <numero_nf da view>`
- `nd = NULL` (nunca preenchido)

O correto, conforme o de-para com `dados_dachser.t_dados_financeiro_contas_receber` (exposto via `v_fin_regua_contas_receber`):

| t_fin_disputas | t_dados_financeiro_contas_receber | coluna da view |
| -------------- | --------------------------------- | -------------- |
| `nf`           | `nota_fiscal`                     | `numero_nf`    |
| `documento`    | `numerodocumento`                 | `documento`    |
| `nd`           | `segundonumero`                   | `nd`           |

## Mudança

Em `supabase/functions/mariadb-proxy/index.ts`, ajustar **apenas** `save_disputa_cr` (linhas ~3596-3711) e `save_disputa_cr_bulk` (linhas ~3714-3820):

1. No `SELECT` da view `v_fin_regua_contas_receber`, incluir `documento`, `numero_nf`, `nd` (além de `razao_social`, `data_vencimento`, `valor_nf`, `tipo_documento`).
2. Substituir o split de `doc_key` por:
   - `docPart = v.documento` (numerodocumento)
   - `nfPart  = v.numero_nf` (nota_fiscal)
   - `ndPart  = v.nd`        (segundonumero)
3. UPDATE/INSERT em `t_fin_disputas` passa a gravar `documento=docPart`, `nf=nfPart`, `nd=ndPart` (incluir `nd` na lista de colunas do INSERT e no SET do UPDATE).
4. Fallback: se a view devolver `documento` vazio (legado órfão), manter `docPart='CR'` para não quebrar lookup de registros antigos. Lookup de existente continua por `(documento, nf)`.

Nenhuma outra ação é alterada (delete/resolve/observacoes/responsavel/import/demurrage permanecem como estão; `save_disputa` legado em `t_dados_financeiro_nfs` já grava corretamente).

## Observação

Registros antigos já gravados com `documento='CR'` e `nd=NULL` **não** serão retroativamente corrigidos por este ajuste — só novas gravações/atualizações via `/fin/disputa` passam a usar o mapeamento correto. Se quiser também um backfill (`UPDATE` em `t_fin_disputas` setando `documento` e `nd` a partir da view para linhas existentes), me diga e incluo.
