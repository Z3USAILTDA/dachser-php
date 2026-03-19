

## Plano: Forçar `pieces_discrepancy` na lista (situação) para 996-14370731

### Problema
O `FORCED_DISCREPANCIES` foi adicionado apenas no `mariadb-proxy` (usado pelo modal de timeline). A `fetch-status-aereo` (que alimenta a lista/situação) usa `detectPiecesDiscrepancy()` sobre o `timeline_json` do banco, e essa função não está detectando a discrepância automaticamente. Além disso, o override atual do AWB não força `pieces_discrepancy: true`.

### Correção

#### `supabase/functions/fetch-status-aereo/index.ts`

1. **No override do AWB `996-14370731`** (linha 1659): adicionar `force_discrepancy: true` e `baseline_pieces: 26`
2. **Na lógica de aplicação de overrides** (linha ~2522): adicionar tratamento para `force_discrepancy`:
   ```typescript
   if (override.force_discrepancy) {
     row.pieces_discrepancy = true;
     row.baseline_pieces = override.baseline_pieces || row.baseline_pieces;
     row.force_critical = true;
   }
   ```
   Isso garante que na lista, o AWB apareça com o badge vermelho de "Discrepância Peças (26)" e seja classificado como crítico.

### Resultado esperado
- Na lista (situação): badge vermelho "Discrepância Peças (26)" visível
- Na timeline (modal): banner âmbar com valores 26, 15, 11, 6 e 5 (já funciona)
- Persiste permanentemente independente de atualizações do banco

### Arquivo modificado
1. `supabase/functions/fetch-status-aereo/index.ts` — adicionar `force_discrepancy` ao override e à lógica de aplicação

