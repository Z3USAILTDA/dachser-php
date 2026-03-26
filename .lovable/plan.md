

## Adicionar Ordenação (Sort) nas Colunas da Tela de Pagamentos

A tela principal (VoucherTable) possui headers clicáveis com ícones de seta para ordenar por coluna. A tela de Pagamentos (PagamentosTab) usa `<th>` estáticos sem nenhuma funcionalidade de ordenação.

### O que será feito

Adicionar a mesma mecânica de sort da tela principal nas colunas da PagamentosTab:

**Colunas com sort:** SPO, Fornecedor, Valor, Vencimento, Forma Pag., Tipo Exec.

**Implementação em `src/components/esteira/PagamentosTab.tsx`:**

1. Adicionar estados `sortField` e `sortDirection` (mesma lógica do VoucherTable)
2. Criar tipo `PagSortField = "numero_spo" | "fornecedor" | "valor" | "vencimento" | "forma_pagamento" | "tipo_execucao_pagamento"`
3. Criar funções `handleSort` e `getSortIcon` (idênticas ao padrão existente)
4. Criar componente inline `SortableHeader` (botão ghost com ícone de seta)
5. Aplicar `useMemo` para ordenar `pagamentos` antes do `.map()` na tabela
6. Substituir os `<th>` estáticos das colunas listadas por `<SortableHeader>`

**Importações adicionais:** `ArrowUpDown`, `ArrowUp`, `ArrowDown` do lucide-react.

Nenhum outro arquivo será alterado.

