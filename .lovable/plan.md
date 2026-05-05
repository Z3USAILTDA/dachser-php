## Problema

Na aba **Pagamentos** (`/fin/esteira`), cada vez que o usuário muda um filtro, a UI demora vários segundos para responder. A causa não é o front — é o backend `mariadb-proxy` (case `list_pagamentos`), que dispara **três queries pesadas em sequência** a cada mudança de filtro:

1. `COUNT(DISTINCT v.id)` com JOIN em `t_dados_financeiro_voucher` (dfv).
2. `SELECT DISTINCT ... FROM t_vouchers v LEFT JOIN dfv ... GROUP BY v.id` com **duas subqueries correlacionadas por linha** (`has_boleto_anexo` e `enviado_por_user_name`) — padrão N+1 dentro do SQL.
3. Stats dos 6 cards usando uma **derived table `SELECT DISTINCT v.*`** sobre todo o resultado filtrado — escaneia tudo de novo só para deduplicar.

Três pontos críticos pioram tudo:

- O **JOIN com `dfv`** existe apenas porque o código original tentava expor algo dela — mas o `SELECT` não usa nenhuma coluna de `dfv`. O JOIN só serve para inflar linhas e nos forçar a usar `DISTINCT`/`GROUP BY` em todo lugar, e a `COLLATE` por linha no `ON` impede uso de índice.
- As **subqueries correlacionadas** (`has_boleto_anexo`, `enviado_por_user_name`) executam uma vez por voucher retornado (até 100 por página).
- Sem **debounce nos filtros de Select** — clicar rapidamente em 2 cards dispara 2 ciclos completos das 3 queries.

## Mudança

### 1. Backend — `supabase/functions/mariadb-proxy/index.ts` (case `list_pagamentos`)

**a) Remover o JOIN inútil com `t_dados_financeiro_voucher`** das três queries (count, listagem, stats). Nenhuma coluna de `dfv` é usada no `SELECT`; o JOIN só introduz duplicatas. Sem o JOIN:
- Cai o `DISTINCT` / `GROUP BY v.id`.
- A stats deixa de precisar da derived table `SELECT DISTINCT v.*` e vira um `SELECT ... FROM t_vouchers v ${whereClause}` direto.
- O `COUNT(DISTINCT v.id)` vira `COUNT(*)`.

**b) Substituir as subqueries correlacionadas por JOINs agregados** apenas sobre a página atual:
- `has_boleto_anexo`: `LEFT JOIN (SELECT voucher_id, COUNT(*) c FROM t_voucher_anexos WHERE tipo IN ('BOLETO','BOLETO_INSTRUCOES') GROUP BY voucher_id) a ON a.voucher_id = v.id` — ou manter como subquery escalar mas só após paginação (CTE/derived table envolvendo o `LIMIT`).
- `enviado_por_user_name`: idem, via `LEFT JOIN LATERAL` substituto (MariaDB ≥ 10.3) ou subselect agregando `MAX(data_hora)` + segundo JOIN. Alternativa mais simples: **mover esses dois campos para um segundo round-trip** que recebe a lista de `v.id` da página e devolve um mapa `{id → {has_boleto, enviado_por}}`. Frontend faz merge antes de `setPagamentos`.

**c) Rodar count + lista + stats em paralelo** com `Promise.all([...])` (hoje são `await` sequenciais).

### 2. Frontend — `src/components/esteira/PagamentosTab.tsx`

**a) Debounce de 250 ms** no efeito que dispara `loadPagamentos` (linha 318–320) — evita disparos múltiplos quando o usuário muda 2 filtros seguidos ou clica em cards rapidamente.

**b) Cancelamento de requisição em voo**: usar um `AbortController` / contador de "request id" para descartar resposta antiga se uma nova já saiu (evita flicker e setState atrasado).

**c) Estado de loading dedicado dos cards** (`statsLoading`) com leve fade — o usuário vê que recalculou.

### 3. Banco — recomendação (sem migration agora)

Verificar índices em `t_vouchers`:
- `(vencimento, created_at)` para o `ORDER BY`.
- `(status_pagamento)`, `(tipo_execucao_pagamento)`, `(forma_pagamento)`, `(status_integracao_rm)`, `(fornecedor)` — pelo menos índices simples nos campos filtráveis mais usados.
- Em `t_voucher_anexos`: `(voucher_id, tipo)`.
- Em `t_voucher_logs`: `(voucher_id, acao, data_hora)`.

Se o usuário aprovar, posso checar os índices existentes via `read_query` antes de propor migration.

## Resultado esperado

- Mudança de filtro responde em **< 500 ms** (vs. vários segundos hoje).
- 6 cards continuam refletindo os filtros, mas recalculados em paralelo com a lista.
- Sem mudanças visuais além do micro-loading dos cards.

Sem mudanças de schema, memória, ou outras telas.
