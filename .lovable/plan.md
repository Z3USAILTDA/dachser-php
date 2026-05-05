## Adicionar paginação na aba Pagamentos

**Arquivo:** `src/components/esteira/PagamentosTab.tsx`

### Mudanças

1. **Estado de paginação**
   - Adicionar `const [currentPage, setCurrentPage] = useState(1);`
   - Constante `const ITEMS_PER_PAGE = 20;` (padrão alinhado às demais tabelas).

2. **Derivar lista paginada**
   - A partir de `sortedPagamentos`, calcular:
     - `totalPages = Math.ceil(sortedPagamentos.length / ITEMS_PER_PAGE)`
     - `paginatedPagamentos = sortedPagamentos.slice(startIndex, startIndex + ITEMS_PER_PAGE)`
   - Trocar o `sortedPagamentos.map(...)` (linha 1054) por `paginatedPagamentos.map(...)`.

3. **Reset de página**
   - `useEffect` que reseta `currentPage` para 1 quando mudam: filtros, ordenação ou tamanho da lista (`sortedPagamentos.length`, `sortConfig`).

4. **Controles de paginação**
   - Logo abaixo da `<table>` (após `</div>` do bloco da tabela), inserir rodapé com:
     - Texto "Mostrando X – Y de Z processos".
     - Botões Anterior / Próxima + indicador "Página N de M".
   - Reusar o componente já existente `TablePagination` de `src/components/layout/TablePagination.tsx` para manter consistência visual com o restante do app.

5. **"Selecionar todos"**
   - Ajustar o checkbox do header para refletir somente a página atual: `checked` quando todos os IDs de `paginatedPagamentos` estão em `selectedIds`, e `handleSelectAll` passa a alternar somente esses IDs (mantém seleções de outras páginas).

### Não muda
- Lógica de fetch, filtros, ordenação, ações em lote, modais de anexos/justificativa.
- Estilos visuais da tabela.