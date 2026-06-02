# Pagamentos: carregar todos os registros, mantendo paginação na UI

## Causa raiz
O frontend pede `perPage=100` e a paginação visual roda em cima desse subconjunto. Qualquer voucher fora dos 100 primeiros fica invisível, mesmo navegando pelas páginas. A correção é **buscar TODOS os vouchers filtrados** e deixar a paginação só como navegação visual.

## Mudanças

### 1. `supabase/functions/mariadb-proxy/index.ts` — handler `list_pagamentos`
- Quando `perPage` vier ausente, `0`, negativo ou `'all'`, não aplicar `LIMIT/OFFSET` na CTE `page_v` — devolver todos os vouchers que casam com o `whereClause`.
- Quando `perPage` vier numérico positivo, manter o comportamento atual (compat retro com outros chamadores).
- `total` continua sendo retornado.

### 2. `src/components/esteira/PagamentosTab.tsx`
- Em `loadPagamentos`, **remover** `page: 1` e `perPage: 100` do body — passa a buscar tudo.
- Manter intacta a paginação client-side: `ITEMS_PER_PAGE = 20`, `currentPage`, `totalPages`, `paginatedPagamentos`, `TablePagination`.
- `totalPages` continua calculado sobre `sortedPagamentos.length` (agora é o conjunto completo, não os 100 primeiros).
- Manter ordenação client-side e cards de stats como estão.

## Resultado
O processo aparece independentemente da página: se ele entra no filtro, está no dataset; basta navegar até a página onde ele caiu na ordenação atual.

## Fora de escopo
- UI/layout da tabela e dos filtros.
- Sort/paginação server-side (paginação continua client-side, propositalmente).
- Virtualização ou scroll infinito.
