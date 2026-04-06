

## Plano: Replicar classificação e visualização de discrepância do /air/tracking para /air/tracking-aereo

### Problema

O `/air/tracking-aereo` usa uma função simplificada `checkTimelineDiscrepancy` que retorna apenas `true/false`. O `/air/tracking` (Index.tsx) recebe do backend `baseline_pieces`, `has_dis_event` e mostra badges mais ricos:
- Badge âmbar para DIS puro (sem discrepância de peças)
- Badge vermelho com contagem: "Discrepância Peças (22)"

### Alterações

**Arquivo: `src/pages/air/TrackingAereo.tsx`**

1. **Tipo AWBData** (~linha 235): adicionar `baseline_pieces?: number | null` e `has_dis_event?: boolean`

2. **Função `checkTimelineDiscrepancy`** (~linha 435): refatorar para retornar objeto `{ discrepancy: boolean, baseline: number | null, hasDis: boolean }` em vez de apenas boolean. Lógica:
   - Extrair peças dos eventos do timeline
   - Baseline = primeiro valor de peças encontrado
   - hasDis = algum evento com código "DIS"
   - Se último evento for delivery (DLV/POD) com peças === baseline → sem discrepância

3. **Mapeamento dos dados** (~linha 387-414): usar o retorno enriquecido para popular `pieces_discrepancy`, `baseline_pieces` e `has_dis_event`

4. **Badge de Situação** (~linha 872-898): replicar a lógica de renderização do Index.tsx:
   - DIS puro (sem `pieces_discrepancy`) → badge âmbar "DIS - Discrepância"
   - Crítico com `pieces_discrepancy` → badge vermelho "Discrepância Peças (N)" mostrando `baseline_pieces`
   - Crítico com `has_dis_event` → badge vermelho "DIS - Discrepância"
   - Demais críticos → badge vermelho "Crítico"

### Nenhum outro arquivo alterado

