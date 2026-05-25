## Ajuste no Card de Observações (Olhinho de Pagamentos)

### Objetivo
O card "Observações" no detalhe do pagamento (olhinho) deve ser **sempre visível**, indicando claramente se há ou não comentários da operação.

### Alterações

1. **Remover condicional de renderização**
   - Atualmente o card só aparece quando `comentarios_operacao` tem texto.
   - O card deve ser renderizado incondicionalmente.

2. **Dois estados visuais**
   - **Com comentários**: mostrar o badge "Operação" + o texto do comentário (comportamento atual).
   - **Sem comentários**: mostrar um texto indicativo como "Sem observações" em tom muted, mantendo a estrutura do card.

### Arquivo alvo
- `src/components/esteira/PagamentosTab.tsx` — ajustar o bloco do card "Observações" (linhas ~1461-1474).

### Fora de escopo
- Sem alterações no backend (campo `comentarios_operacao` já é retornado).
- Sem alterações em outras abas ou comportamentos.