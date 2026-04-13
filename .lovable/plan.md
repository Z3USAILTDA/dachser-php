

## Plano: Corrigir botões de copiar na tela de Pagamentos

### Problema
Os botões de copiar (linha digitável, código de barras, dados bancários, PIX) no painel `DadosPagamentoPanel` não funcionam. O componente é renderizado dentro de um `Dialog`, onde o focus trap do dialog interfere com o fallback `execCommand('copy')` — o textarea criado fora do dialog perde o foco imediatamente.

### Alteração

**`src/utils/clipboard.ts`**

Melhorar o fallback para funcionar dentro de dialogs:

1. Usar `window.getSelection()` + `Range` como método alternativo ao `textarea.select()`
2. Inserir o textarea como filho do elemento ativo (`document.activeElement?.closest('[role="dialog"]')`) em vez de `document.body`, para manter o foco dentro do dialog
3. Adicionar tentativa com `navigator.clipboard.write()` usando `ClipboardItem` como fallback intermediário

```typescript
// Fallback: inserir textarea no dialog ativo (se houver) para evitar perda de foco
const container = document.activeElement?.closest('[role="dialog"]') || document.body;
container.appendChild(textarea);
```

### Resultado
Botões de copiar funcionarão corretamente tanto na tela principal quanto dentro de dialogs na aba Pagamentos.

