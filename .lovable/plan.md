## Objetivo

Substituir o estado "Nenhum MBL encontrado" exibido durante o fetch inicial por um indicador de carregamento ("Buscando MBLs...").

## Mudança

Arquivo: `src/pages/ContainerTracking.tsx`, bloco do empty state (linha ~2996–3000).

Hoje, quando `filteredMbls.length === 0` o componente já mostra o card "Nenhum MBL encontrado" — mesmo enquanto a primeira busca ainda está rodando (`isLoadingData === true`), o que confunde o usuário.

Alterar a renderização para:

- Se `isLoadingData` (ou ainda sem dados carregados) → mostrar bloco "Buscando MBLs..." com `Loader2` animado e cor dourada (`#ffc800`), seguindo o tema DACHSER.
- Caso contrário (fetch concluído e lista vazia) → manter o "Nenhum MBL encontrado" atual.

## Detalhes técnicos

- Reaproveitar `isLoadingData` (já existe em `useState`, linhas 505/935/954/970) — sem novos estados.
- Usar `Loader2 className="w-10 h-10 mb-3 animate-spin text-[#ffc800]"` + texto "Buscando MBLs..." e subtítulo "Sincronizando com os armadores".
- Edição surgical: apenas o `else` do ternário na linha ~2996. Nada de refatoração.
- Sem mudanças em edge functions, SQL ou cards superiores (os zeros nos cards são naturais durante o load e ficam consistentes com a tabela vazia + spinner).