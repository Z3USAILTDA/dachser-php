

## Plano: Corrigir validação de boleto no envio para Fiscal

### Causa raiz

Há uma inconsistência no `VoucherOperacaoActions.tsx`:

- **Linha 59** (estado do botão): Corretamente usa `boletoObrigatorio = voucher.formaPagamento === "BOLETO"` — o botão fica habilitado para TRANSFERENCIA sem boleto.
- **Linha 256** (dentro de `handleEnviar`): Valida `!hasBoleto` **sem considerar** `boletoObrigatorio` — bloqueia o envio e exibe erro "É necessário anexar Fatura/Demonstrativo e Boleto/Instruções" mesmo para TRANSFERENCIA.

### Correção

No `handleEnviar` (linhas 252-264), aplicar a mesma lógica do estado:

```typescript
// Antes (linha 256):
if (!hasFatura || !hasBoleto) {

// Depois:
const boletoObrigatorio = voucher.formaPagamento === "BOLETO";
if (!hasFatura || (boletoObrigatorio && !hasBoleto)) {
```

Também ajustar a mensagem de erro para ser dinâmica:

```typescript
description: boletoObrigatorio 
  ? "É necessário anexar Fatura/Demonstrativo e Boleto/Instruções"
  : "É necessário anexar Fatura/Demonstrativo",
```

### Arquivo
- `src/components/esteira/VoucherOperacaoActions.tsx` — linhas 252-264

### Resultado
Vouchers com forma de pagamento TRANSFERENCIA poderão ser enviados apenas com Fatura/Demonstrativo, sem exigir boleto.

