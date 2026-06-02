# Busca unificada na aba Pagamentos (Esteira)

Atualmente o campo de busca da aba Pagamentos filtra apenas por `fornecedor`. O objetivo é transformá-lo em uma busca genérica que case com o **número do Voucher/SPO** OU com o **nome do Fornecedor**, e ajustar o rótulo da coluna correspondente.

## Mudanças

### 1. Frontend — `src/components/esteira/PagamentosTab.tsx`

- **Input de busca (linha ~772-778):**
  - Trocar `placeholder="Buscar por fornecedor..."` por `placeholder="Buscar por Voucher/SPO ou Fornecedor..."`.
  - Manter o estado `filterFornecedor` / debounce (sem renomear para evitar refactor amplo); apenas passar o valor ao backend num parâmetro novo mais semântico.
- **Chamada `loadPagamentos` (linha ~314):**
  - Substituir `filterFornecedor: ...` por `filterBusca: filterFornecedorDebounced.trim() || undefined` (mantém o input/debounce existente, só renomeia a chave enviada ao backend). Compatibilidade: também enviar `filterFornecedor` com o mesmo valor para não quebrar deploys parciais.
- **Cabeçalho da coluna (linha ~1179):**
  - Trocar o texto `SPO` por `Voucher/SPO` (mantendo o ícone de ordenação).

### 2. Backend — `supabase/functions/mariadb-proxy/index.ts` (action `list_pagamentos`)

- Adicionar `filterBusca` ao destructuring e à interface do payload (linhas ~11517 e ~11529).
- Substituir o bloco atual (linhas ~11577-11580):
  ```ts
  if (filterFornecedor) {
    conditions.push("v.fornecedor LIKE ?");
    params.push(`%${filterFornecedor}%`);
  }
  ```
  por uma condição unificada que aceita `filterBusca` (preferencial) ou faz fallback para `filterFornecedor`:
  ```ts
  const termoBusca = (filterBusca ?? filterFornecedor)?.trim();
  if (termoBusca) {
    conditions.push("(v.numero_spo LIKE ? OR v.fornecedor LIKE ?)");
    params.push(`%${termoBusca}%`, `%${termoBusca}%`);
  }
  ```

## Fora de escopo

- Nenhuma alteração em outras abas (Backlog, Comprovantes, Faturas, Robô).
- Nenhum refactor de nomes de estado/variáveis além do mínimo descrito.
- Nenhuma mudança em ordenação, paginação, RLS ou schema.
