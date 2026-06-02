## Ajustes em /air/tracking-aereo

Edição única em `src/pages/air/TrackingAereo.tsx`. Sem mudanças em schema, edge functions ou outras telas.

### 1. Lógica — "Sem atualizações" (>30 dias) entra como Crítico

- Criar helper `isStale(awb)`: `last_event_date` existe e a diferença `(agora - parseDBDate(last_event_date)) / 86400000 > 30`. Excluir processos já finalizados/ocultos (DLV, POD, `hide_reason`, `arr_destino_date` > 5 dias, `is_invalid`, `tracking_failed`) — mesmas exclusões já usadas em `cardCounts`.
- **Coluna "Último Evento"** (linhas ~1154-1166): ao lado do código (ex.: `DEP`), quando `isStale`, renderizar badge `⚠ Sem atualizações` (estilo amber/vermelho, mesmo padrão visual dos demais badges da coluna).
- **Coluna "Situação"** (linhas ~1171-1210): quando `isStale` e não for Inválido/Falha/DIS/Discrepância, exibir badge vermelho "Crítico - Sem atualizações".
- **`cardCounts.critical`** (linhas ~692-717): somar `isStale` ao critical (junto com NIL/NIF/OFLD e `pieces_discrepancy`).
- **`cardFilter === "criticos"`** (linha ~781): incluir `isStale(awb)` na condição, para que clicar no card Críticos mostre também esses processos.

### 2. Visual — Cards refletem filtros ativos

Hoje `cardCounts` (linhas ~692-717) é calculado sobre `awbsData` cru, ignorando os filtros de topo.

- Extrair os filtros de topo (search, airline, analyst, processType) do `useMemo` de `filteredAwbs` para uma função `applyTopFilters(awb)` reutilizável.
- Recalcular `cardCounts` sobre `awbsData.filter(applyTopFilters)` em vez de `awbsData`.
- **Importante**: `cardFilter` em si NÃO entra nessa base (senão os outros cards zerariam ao clicar em um). Apenas search/airline/analyst/processType afetam os contadores.

Resultado: ao escolher analista, airline, tipo de processo ou digitar busca, os 4 cards (Total / Em trânsito / Em alerta / Críticos) passam a contar apenas os processos visíveis sob esses filtros — e Críticos já incluirá os "Sem atualizações".