

## Plano: Corrigir Roteamento de Voucher Urgente na Criação

### Problema Identificado

O bug **não está** no `VoucherOperacaoActions.tsx` (que só age quando o voucher já está na etapa OPERAÇÃO). O problema está no **`CreateVoucherDialog.tsx`** (linha 426):

```typescript
let etapaAtual = "FISCAL"; // Padrão: direto para fiscal
if (isDraft) {
  etapaAtual = "RASCUNHO";
}
```

Quando um voucher é criado (não rascunho), ele vai **direto para FISCAL**, ignorando completamente se é urgente (`URGENTE_REAL`). A lógica de roteamento por urgência nunca é consultada.

### Correção

**Arquivo: `src/components/esteira/CreateVoucherDialog.tsx`** (linhas 424-429)

Alterar a determinação de `etapaAtual` para considerar urgência:

```typescript
let etapaAtual: string;
if (isDraft) {
  etapaAtual = "RASCUNHO";
} else if (urgenciaTipo === "URGENTE_REAL") {
  etapaAtual = "SUPERVISOR";
} else {
  etapaAtual = "FISCAL";
}
```

Isso garante que vouchers urgentes vão direto para SUPERVISOR na criação, sem precisar passar pela etapa OPERAÇÃO primeiro.

Também precisa ajustar o envio de notificação por e-mail (já existente no `CreateVoucherDialog`) para incluir os dados completos do voucher e os botões de aprovação quando `etapaAtual === "SUPERVISOR"`.

### Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `src/components/esteira/CreateVoucherDialog.tsx` | Roteamento na criação: URGENTE_REAL → SUPERVISOR em vez de FISCAL |

