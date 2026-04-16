

## Plano: Campos "Tipo de Documento" e "Forma de Pagamento" começam vazios

### Problema
`formaPagamento` tem default `"BOLETO"` na linha 179, o que faz o campo já vir preenchido e passar na validação `.min(1)` sem interação do operador.

### Alterações

**Arquivo: `src/components/esteira/CreateVoucherDialog.tsx`**

1. **Linha 179** — Trocar `formaPagamento: "BOLETO"` por `formaPagamento: ""`
2. **Select de Forma de Pagamento (~L1203-1230)** — Garantir que o `SelectTrigger` mostra placeholder "Selecione..." quando vazio (usar `value={field.value || undefined}` para que o shadcn Select mostre o placeholder)
3. **Select de Tipo de Documento** — Mesmo tratamento: garantir placeholder visível quando vazio

Com isso, ambos os campos começam sem valor, a validação `.min(1)` já existente bloqueia o envio, e o operador é obrigado a escolher manualmente.

