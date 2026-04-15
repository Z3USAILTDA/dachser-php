
Objetivo: corrigir os botões de copiar dos dados bancários e boletos, que hoje continuam falhando principalmente na área da esteira e nos dialogs.

O que encontrei:
- Os botões afetados usam o utilitário central `src/utils/clipboard.ts`.
- As telas mais impactadas são:
  - `src/components/esteira/DadosPagamentoPanel.tsx`
  - `src/components/esteira/PagamentosTab.tsx`
  - `src/components/esteira/FaturasDoDiaTab.tsx` (legado, mas com a mesma lógica)
- O problema mais provável está no fallback do `copyToClipboard`:
  - ele cria um `textarea`, faz `focus()` e `select()`
  - depois substitui essa seleção por um `Range` em `selectNodeContents(textarea)`
  - isso pode invalidar a seleção necessária para `document.execCommand('copy')`, especialmente dentro de dialogs/focus trap/preview iframe

Plano de implementação:
1. Corrigir `src/utils/clipboard.ts`
- Simplificar o fallback legado para não trocar a seleção após `textarea.select()`
- Garantir:
  - `textarea.setAttribute('readonly', 'true')`
  - `textarea.select()`
  - `textarea.setSelectionRange(0, textarea.value.length)`
  - `document.execCommand('copy')`
- Preservar e restaurar foco/seleção anterior quando possível
- Manter a lógica de inserir o `textarea` dentro do dialog ativo

2. Tornar o fallback mais robusto em preview/modal
- Detectar o elemento ativo antes da cópia
- Restaurar foco ao final para não quebrar a experiência no dialog
- Garantir remoção do `textarea` mesmo em erro

3. Validar os pontos de uso principais
- Confirmar que `DadosPagamentoPanel` continua usando o utilitário corrigido para:
  - linha digitável
  - código de barras
  - dados bancários
  - chave PIX
- Confirmar que `PagamentosTab` e `FaturasDoDiaTab` continuam compatíveis sem mudanças de API

4. Teste manual após a correção
- Verificar no fluxo de pagamento dentro do dialog:
  - copiar linha digitável
  - copiar código de barras
  - copiar dados bancários
- Verificar também fora de dialog, se houver botão equivalente, para garantir que a correção não quebrou outros usos

Detalhes técnicos:
- Arquivo principal a ajustar: `src/utils/clipboard.ts`
- Causa provável: o uso de `window.getSelection().addRange(...)` em um `textarea`
- Abordagem segura: usar somente a seleção nativa do próprio `textarea`, que é o padrão mais compatível com `execCommand('copy')`

Impacto esperado:
- Corrige de uma vez todos os botões que dependem do utilitário compartilhado
- Evita remendos individuais em cada tela
- Mantém compatibilidade com preview, dialogs e navegadores com restrições de clipboard
