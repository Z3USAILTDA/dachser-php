

## Plano: Separar DIS e Discrepância de Peças entre os cards

### Regra
- **Em Alerta**: apenas `code === "DIS"` ou `has_dis_event` (sem discrepância de peças)
- **Crítico**: `pieces_discrepancy`, além dos já existentes (NIL, NIF, OFLD, tracking_failed)

### Alteração

**`src/pages/air/TrackingAereo.tsx`**

1. **Contagem (linhas ~516-517)**:
   - `alert`: `code === "DIS" || (awb.has_dis_event && !awb.pieces_discrepancy)`
   - `critical`: `criticalCodes.has(code) || awb.pieces_discrepancy`

2. **Filtro de cards (linhas ~569-570)**:
   - `case "alerta"`: `code === "DIS" || (awb.has_dis_event && !awb.pieces_discrepancy)`
   - `case "criticos"`: `awb.tracking_failed || ["NIL","NIF","OFLD"].includes(code) || awb.pieces_discrepancy`

### Resultado
Processos com evento DIS (sem discrepância de peças) vão para "Em Alerta". Processos com discrepância de peças vão para "Críticos".

