# Corrigir filtro por data de vencimento na tela de Pagamentos

## Causa raiz
O filtro `De/Até` por data de vencimento roda no **frontend** sobre apenas os **100 primeiros registros** que o backend devolve. SPOs fora dessa janela inicial (ex.: 20261883725) ficam invisíveis no filtro de data, mas aparecem ao buscar pelo número porque a busca textual já é enviada ao backend.

## Mudanças

### 1. `src/components/esteira/PagamentosTab.tsx`
- No `loadPagamentos`, enviar os novos parâmetros ao invocar `mariadb-proxy`:
  - `filterDataVencimentoInicio`: ISO `YYYY-MM-DD` derivado de `filterDataInicio`
  - `filterDataVencimentoFim`: ISO `YYYY-MM-DD` derivado de `filterDataFim`
- Incluir `filterDataInicio` e `filterDataFim` no array de dependências do `useEffect` que chama `loadPagamentos` (para refazer a consulta ao alterar as datas).
- Remover (ou neutralizar) o `useMemo` `dateFilteredPagamentos` — passa a usar `pagamentos` diretamente em `sortedPagamentos`, já que o backend devolve os dados filtrados.

### 2. `supabase/functions/mariadb-proxy/index.ts` — handler `list_pagamentos`
- Ler `filterDataVencimentoInicio` e `filterDataVencimentoFim` do body.
- Adicionar à cláusula `WHERE` da query principal e da query de `stats`:
  - `AND DATE(v.vencimento) >= ?` quando início estiver presente
  - `AND DATE(v.vencimento) <= ?` quando fim estiver presente
- Manter compatibilidade com o filtro pré-existente `filterVencimento` (hoje / vencidos / proximos7 / a_vencer) — os dois podem coexistir (AND).

## Resultado
O filtro De/Até passa a consultar o banco completo (não apenas os 100 primeiros), igualando o comportamento ao filtro de busca por SPO. O processo 20261883725 aparecerá no intervalo de vencimento correto.

## Fora de escopo
- Não alterar `perPage` nem introduzir paginação server-side dos demais filtros.
- Não mexer no filtro rápido por presets (`filterVencimento`).
