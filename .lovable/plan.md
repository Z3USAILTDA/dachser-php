## Corrigir botão "Atualizar" da aba Pagamentos

**Sintoma:** Ao clicar em "Atualizar", o botão fica desabilitado (spinning) e a lista não atualiza visivelmente; clicar de novo não faz nada.

**Causa raiz:** Em `src/components/esteira/PagamentosTab.tsx`:

1. O onClick faz `setPagamentos([])` e dispara `loadPagamentos()`. Isso muda `pagamentos.length` para 0 enquanto `loading` é setado dentro de `loadPagamentos` para `true`. O guard `if (loading && pagamentos.length === 0) return <Loader fullscreen>` (linha 693) substitui a tela inteira por um spinner — o usuário não vê resultado retornar e perde contexto.
2. `setRefreshing(false)` só roda no `finally` quando `reqId === loadReqIdRef.current`. Se uma segunda request começa antes da primeira terminar (clique duplo, ou efeito de filtro), o botão fica preso em `disabled` para sempre porque o `finally` da request "antiga" cai no early-return e nunca libera `refreshing`.
3. O `catch` também faz early-return sem limpar `refreshing` quando a request é descartada.

### Correções (arquivo único: `src/components/esteira/PagamentosTab.tsx`)

1. **Liberar `refreshing` sempre no `finally`**, fora do guard de `reqId`. Apenas `setLoading(false)` permanece dentro do guard.
2. **No `catch`**, quando a request é descartada (`reqId !== current`), também chamar `setRefreshing(false)` antes do return.
3. **Remover `setPagamentos([])` do onClick do botão** — manter a lista atual visível enquanto recarrega; só limpar o cache de dados bancários. Isso evita o "loader fullscreen" e dá feedback de que o conteúdo está sendo refeito (apenas o spinner do botão "Atualizar" gira).
4. Aceitar parâmetro opcional `loadPagamentos({ silent: true })` para o caminho do botão Atualizar, evitando setar `loading=true` (que já dispararia o overlay caso a lista fosse esvaziada por algum motivo). O caminho normal (mudança de filtro / mount) continua usando `loading=true`.

### Não muda
- Edge function `mariadb-proxy` (logs mostram `list_pagamentos` respondendo OK em ~1s).
- Filtros, paginação, seleção, modais.
- Lógica de dedupe e de `reqId`.