

## Plano: Mover STATUS_CRITICIDADE "DIS - Discrepância" para o card "Em Alerta"

### Problema
Processos com `pieces_discrepancy = true` ou `has_dis_event = true` estão sendo contabilizados no card **Críticos**, mas deveriam estar no card **Em Alerta**, pois representam "DIS - Discrepância".

### Alteração

**`src/pages/air/TrackingAereo.tsx`**

1. **Contagem dos cards (linha ~516-517)**: Incluir `pieces_discrepancy` e `has_dis_event` na contagem de `alert` em vez de `critical`:
   - Antes: `if (code === "DIS") alert++;` e `if (criticalCodes.has(code) || awb.pieces_discrepancy) critical++;`
   - Depois: `if (code === "DIS" || awb.pieces_discrepancy || awb.has_dis_event) alert++;` e remover `awb.pieces_discrepancy` da linha de `critical`

2. **Filtro de cards (linha ~569-570)**: Mover `pieces_discrepancy` e `has_dis_event` do filtro `criticos` para o filtro `alerta`:
   - Antes: `case "alerta": return code === "DIS";` e `case "criticos": return ... || awb.pieces_discrepancy;`
   - Depois: `case "alerta": return code === "DIS" || awb.pieces_discrepancy || awb.has_dis_event;` e `case "criticos": return awb.tracking_failed || criticalCodes.includes(code);`

### Resultado
Todos os processos com discrepância (DIS, pieces_discrepancy, has_dis_event) serão contabilizados e filtrados pelo card "Em Alerta".

