## Diagnóstico

Os dois vouchers abaixo foram agrupados em um master que recebeu o `numero_spo` errado:

| numero_spo  | id_rm    | idmov   | created_at (t_vouchers) |
|-------------|----------|---------|--------------------------|
| 20261567083 | 4665781  | 7755987 | 2026-05-13 15:36:43      |
| 20263777220 | 4665788  | 7755997 | 2026-05-13 15:33:22      |
| **MASTER**  | NULL     | —       | 2026-05-13 15:36:43      |

A regra (memória `master-numbering-logic-v1`) diz que o master herda o `numero_spo` do filho com **menor `sort_key = COALESCE(idmov, id_rm)`**. O menor `idmov` é `7755987` (filho `20261567083`), então o master deveria ser **`20261567083`** — mas ficou **`20263777220`**.

### Causa raiz

No `case 'create_voucher_master'` (mariadb-proxy/index.ts ~13147) o cálculo do `sort_key` é feito por uma query que parte de `t_vouchers`:

```sql
FROM dados_dachser.t_vouchers v
LEFT JOIN t_dados_financeiro_voucher dfv ON ...
WHERE v.numero_spo IN (...voucher_ids)
```

E só **depois** dessa query o código cria os "mirror records" para os processos que existem apenas no financeiro (`missingProcessos`).

Pelos timestamps, o filho `20261567083` foi criado no mesmo instante do master (`15:36:43`) — ou seja, ele **era um mirror criado durante o próprio fluxo de `create_voucher_master`**. Quando a query do `sort_key` rodou, esse filho **ainda não existia em `t_vouchers`**, então ele não entrou no `reduce` que escolhe o menor `idmov`. O único filho considerado foi o `20263777220` (já existente desde 15:33:22), e o master herdou o `numero_spo` dele.

Resultado: o `numeroSpoMaster` foi decidido com base num conjunto **incompleto** de filhos. O filho com `idmov` realmente menor (`7755987`) só passou a existir alguns ms depois, via mirror — tarde demais.

## Correção proposta (cirúrgica, 1 arquivo)

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts` — `case 'create_voucher_master'`

1. Antes de calcular `numeroSpoMaster`, fazer **uma segunda query em `t_dados_financeiro_voucher`** para todos os `voucher_ids` (não só os já presentes em `t_vouchers`), trazendo `nd, idmov, id_rm`.
2. Construir uma lista unificada `{ numero_spo, sort_key }` combinando:
   - linhas resolvidas de `t_vouchers` (com `COALESCE(dfv.idmov, v.id_rm, dfv.id_rm)`)
   - linhas de `dfv` que tenham `nd` em `voucher_ids` (com `COALESCE(idmov, id_rm)`)
3. Aplicar o `reduce` do menor `sort_key` sobre essa lista unificada → garante que filhos que ainda serão criados como mirror também participem da escolha.
4. Manter o fallback atual (primeiro `numero_spo` ou `MASTER-XXXX`) inalterado.

Nenhuma mudança em `fix_master_numero_spo` (já lê de `t_vouchers` após os mirrors estarem criados, então funciona corretamente para reprocessar masters antigos).

## Fix retroativo para esses 2 masters

Após aplicar a correção, basta chamar `fix_master_numero_spo` (já existe) ou rodar um `UPDATE` direto trocando o `numero_spo` do master `041fec4c-…` de `20263777220` para `20261567083`. Posso fazer isso via `raw_query` na próxima etapa, se você confirmar.

## Atualização de memória

Atualizar `mem://vouchers/master-numbering-logic-v1` adicionando: "A coleta de `sort_key` deve unir `t_vouchers` + `t_dados_financeiro_voucher` para `voucher_ids` informados, pois mirrors são criados depois e seriam ignorados."