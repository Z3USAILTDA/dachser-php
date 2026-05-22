## Objetivo
Ajustar a exportação Excel do Aging em `src/pages/olimpo/OlimpoCobranca.tsx` para:
1. Usar fonte **Arial tamanho 8** em todas as células (título, cabeçalho, linhas e totais) das 3 abas (Aging - Product, Aging - Client e Analítico de Clientes).
2. Alinhamento **centralizado** (horizontal: "center", vertical: "center") em todas as células de todas as linhas.

## Alterações
Arquivo único: `src/pages/olimpo/OlimpoCobranca.tsx`

- **`headerStyleFn`**: `font: { name: "Arial", sz: 8, bold: true, ... }`; manter `horizontal: "center"`.
- **`cellStyleFn`**: `font: { name: "Arial", sz: 8, ...override }`; forçar `alignment.horizontal = "center"` (ignorar parâmetro `opts.align`, ou sobrescrever para "center" sempre).
- **Título** (linhas 410 e 599-604 do Analítico): adicionar `name: "Arial"` e `sz: 8` no font; alignment center.
- **Aba Analítico**: nos loops de cabeçalho/linhas/total, garantir que o estilo aplicado via `cellStyleFn` resulte em centralizado (a mudança em `cellStyleFn` já cobre isso, mas remover os `align: "left"/"right"` passados como override — ou apenas neutralizá-los dentro da função).

Manter formatação numérica (`numFmt`), preenchimentos (`fill`), bordas, negrito dos totais, cores e larguras de coluna inalteradas.

Sem mudanças em backend, queries ou outras telas.