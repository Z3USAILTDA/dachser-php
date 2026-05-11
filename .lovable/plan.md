# Adicionar seleção em massa de vouchers no diálogo de vínculo

## Objetivo
Na etapa "Vincular documentos ao lote" (`BatchDocumentBinderDialog`), permitir marcar/desmarcar todos os vouchers da lista de uma vez, semelhante ao "selecionar todas as linhas" usado em outras grids.

## Mudanças (apenas UI, frontend)

Arquivo: `src/components/esteira/BatchDocumentBinderDialog.tsx`

1. No cabeçalho do painel "Vouchers do lote" (onde hoje aparece o contador `COMPLETO/total`), adicionar um `Checkbox` "Selecionar todos" à esquerda do título.
   - Estado `checked`: `true` quando todos os vouchers de `filteredChecklist` já estão em `selectedVouchers`; `indeterminate` quando há seleção parcial; `false` caso contrário.
   - Ao alternar:
     - Se `lockedMaster` estiver ativo, exibir o mesmo toast de aviso usado em `toggleVoucher` ("Encerre o master atual…") e não alterar a seleção.
     - Caso contrário, se nem todos estão selecionados → adicionar todos os `voucher_id` de `filteredChecklist` ao `selectedVouchers`. Se todos já estão → remover esses ids.
   - Respeita a busca (`voucherSearch`): a ação só afeta os vouchers visíveis no momento.

2. Pequeno texto auxiliar ao lado do checkbox: "Selecionar todos ({n})" onde `n` = `filteredChecklist.length`.

3. Manter o contador `COMPLETO/total` à direita como está hoje.

4. Sem mudanças em backend, em `BatchVoucherChecklist`, no master lock, no fluxo de confirmação ou em `mariadb-proxy`.

## Detalhes técnicos
- Usar `Checkbox` de `@/components/ui/checkbox` já importado.
- Para suportar estado indeterminado, usar `data-state` controlado: passar `checked={allSelected ? true : (someSelected ? "indeterminate" : false)}` (Radix Checkbox aceita `"indeterminate"`).
- Computar `allSelected`/`someSelected` via `useMemo` sobre `filteredChecklist` e `selectedVouchers`.
