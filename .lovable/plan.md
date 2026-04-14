

## Plano: Mostrar STATUS_CRITICIDADE na coluna Situação

### Problema
A coluna "Situação" na tela de Tracking Aéreo só mostra badges de discrepância quando `isCritical` é `true`, mas `is_critical` é sempre definido como `false` (linha 376). Os dados de `pieces_discrepancy` e `has_dis_event` vêm do backend corretamente, mas nunca são exibidos.

### Alteração

**`src/pages/air/TrackingAereo.tsx`**

1. **Linha 376**: Calcular `is_critical` com base nos dados de discrepância e status críticos:
   ```typescript
   is_critical: !!item.pieces_discrepancy || !!item.has_dis_event || 
                ["NIL","NIF","OFLD"].includes(getStatusCode(lastEvent).toUpperCase()),
   ```

2. **Coluna Situação (linhas 854-892)**: Reorganizar a lógica para priorizar discrepância antes de `isCritical` genérico, garantindo que:
   - `has_dis_event && !pieces_discrepancy` → badge âmbar "DIS - Discrepância"
   - `pieces_discrepancy` → badge vermelho "Discrepância Peças (baseline)"
   - Outros críticos (NIL, NIF, OFLD) → badge vermelho "Crítico"

### Resultado
Processos com discrepância de peças ou eventos DIS aparecerão com o badge correto na coluna Situação, refletindo o `STATUS_CRITICIDADE` da query SQL.

