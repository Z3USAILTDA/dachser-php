## Problema

Os 6 cards no topo da aba **Pagamentos** (`/fin/esteira` → Pagamentos) — A Vencer, Vencidos, Em Remessa, Manual, Prontos Remessa, Prontos Manual — hoje mostram sempre os totais globais. Quando o usuário aplica um filtro (fornecedor, status, forma de pagamento, status RM, vencimento, ou clica num próprio card), apenas a tabela é filtrada; os números dos cards não mudam.

A causa está no backend `mariadb-proxy` (case `list_pagamentos`): a query de `stats` usa um `WHERE` fixo, ignorando o `whereClause`/`params` aplicados na query principal.

## Mudança

### Backend — `supabase/functions/mariadb-proxy/index.ts` (case `list_pagamentos`, ~linhas 10289–10322)

Reaproveitar `whereClause` e `params` na query de `stats`, para que os 6 cards reflitam exatamente o subconjunto filtrado:

```sql
SELECT
  COUNT(DISTINCT v.id) as total,
  SUM(CASE WHEN v.vencimento >= CURDATE() THEN 1 ELSE 0 END) as a_vencer_count,
  ...
FROM dados_dachser.t_vouchers v
LEFT JOIN dados_dachser.t_dados_financeiro_voucher dfv
  ON dfv.nd COLLATE utf8mb4_general_ci = v.numero_spo COLLATE utf8mb4_general_ci
${whereClause}
```

Passar `params` na chamada. Manter a mesma lista de colunas (`a_vencer_count/valor`, `vencidos_*`, `em_remessa_*`, `manual_*`, `prontos_remessa_*`, `prontos_manual_*`, `valor_total`) — front não muda.

Notas:
- Como a query agora usa o JOIN com `dfv`, envolver as agregações em `CASE` já lida com duplicatas (cada `v.id` aparece pelo menos uma vez). Para máxima fidelidade do `total`, usar `COUNT(DISTINCT v.id)`.
- Os filtros existentes (`filterVencimento`, `filterStatusPagamento`, `filterTipoExecucao`, `filterFormaPagamento`, `filterStatusIntegracaoRm`, `filterFornecedor`) já estão no `whereClause` — nada novo a adicionar.

### Frontend — `src/components/esteira/PagamentosTab.tsx`

Nenhuma mudança de lógica necessária. Os cards já leem de `stats` e o efeito de `loadPagamentos` já roda quando qualquer filtro muda (linha 320). Pequeno ajuste opcional de UX:

- Adicionar transição suave (`transition-all duration-200`) nos números dos cards para deixar claro que recalcularam.

## Resultado

Aplicar qualquer filtro (incluindo clicar num card) atualiza imediatamente os 6 cards para refletir apenas os vouchers do recorte atual. Limpar filtros volta aos totais globais.

Sem mudanças de schema, memória, ou outras telas.