## Causa raiz

O voucher **105-278235 DIM-BY** está em `t_vouchers` com `etapa_atual = 'PRE_LANCAMENTO'`, mas a tela carrega via `get_vouchers_combined` (fast mode), que aplica um **filtro de mês de emissão** com a seguinte regra (mariadb-proxy, linhas 16110-16117):

```sql
AND (
  v.etapa_atual IN ('OPERACAO','FISCAL','SUPERVISOR','FINANCEIRO',
                    'AJUSTE_OPERACAO','AJUSTE_FISCAL','CANCELADO')
  OR (dfv.data_emissao >= ? AND dfv.data_emissao < ?)
  OR (dfv.data_emissao IS NULL
      AND v.data_emissao_documento >= ? AND v.data_emissao_documento < ?)
)
```

`PRE_LANCAMENTO` **não está** na lista de etapas "sempre visíveis". Portanto, um voucher em pré-lançamento só aparece se a `data_emissao` (ou `data_emissao_documento`) cair no mês selecionado no filtro superior. Como vouchers em pré-lançamento normalmente ainda não têm fatura/data de emissão preenchida (é justamente o estágio anterior à anexação dos documentos), o registro fica invisível.

Conclusão: o voucher existe, não foi excluído pelo cleanup (porque deve ter algum anexo ou ainda não rodou), mas o filtro de mês o esconde.

## Correção proposta

Adicionar `'PRE_LANCAMENTO'` à lista de etapas sempre visíveis em `get_vouchers_combined`, mantendo o mesmo comportamento já aplicado a `OPERACAO`, `FISCAL`, `SUPERVISOR`, etc.

### Mudança única

Arquivo: `supabase/functions/mariadb-proxy/index.ts` (linha 16112)

De:
```sql
v.etapa_atual IN ('OPERACAO','FISCAL','SUPERVISOR','FINANCEIRO','AJUSTE_OPERACAO','AJUSTE_FISCAL','CANCELADO')
```

Para:
```sql
v.etapa_atual IN ('OPERACAO','FISCAL','SUPERVISOR','FINANCEIRO','AJUSTE_OPERACAO','AJUSTE_FISCAL','CANCELADO','PRE_LANCAMENTO')
```

Sem alterações em RLS, schema, frontend, lógica de roles ou cleanup. Os filtros de role já permitem `PRE_LANCAMENTO` para Operação, Fiscal e Supervisor (EsteiraIndex.tsx linhas 1269/1274/1278).

## Observação

A regra de cleanup que apaga vouchers em `PRE_LANCAMENTO` sem anexos continua valendo — esta correção apenas garante que, enquanto o voucher existir nessa etapa, ele apareça na esteira independentemente do mês de emissão selecionado.