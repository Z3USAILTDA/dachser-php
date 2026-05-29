## Problema

Em `src/components/esteira/VoucherRascunhoActions.tsx`, o botão "Enviar Voucher/SPO" exige sempre Fatura **e** Boleto:

```ts
const canEnviar = hasFatura && hasBoleto;
```

Isso bloqueia processos cuja forma de pagamento é TRANSFERENCIA / PIX / DOC, onde não existe boleto a ser anexado — caso do voucher `20262479182`.

## Mudança

Tornar o boleto obrigatório **apenas** quando `voucher.formaPagamento === "BOLETO"`.

### Edits em `src/components/esteira/VoucherRascunhoActions.tsx`

1. Adicionar flag:
```ts
const boletoRequired = voucher.formaPagamento === "BOLETO";
const canEnviar = hasFatura && (!boletoRequired || hasBoleto);
```

2. No checklist (linhas 388-395), exibir o item "Boleto / Instruções de Pagamento" como **opcional** quando `!boletoRequired`:
   - Manter linha verde se `hasBoleto`
   - Caso contrário, mostrar texto "(opcional — forma de pagamento não é boleto)" em vez de bolinha vazia exigindo.

3. Mensagem de ajuda (linhas 436-438) e tooltip do botão devem refletir a nova regra (só pedir boleto quando obrigatório).

## Escopo

Mudança puramente de frontend, isolada ao componente `VoucherRascunhoActions.tsx`. Sem alteração de backend, schema ou outros fluxos.
