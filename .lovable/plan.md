# Separar Troca de Master do card Críticos em /air/tracking-aereo

## Objetivo
1. Processos com discrepância de **troca de master** não devem mais contar/aparecer no card "Críticos". Eles ficam exclusivamente acessíveis pelo filtro "Troca de master".
2. O contador (badge) do botão "Troca de master" deve refletir os processos efetivamente visíveis na tela (respeitando as mesmas regras de ocultação aplicadas ao restante: `hide_reason`, ARR destino > 5 dias, `is_invalid`, `tracking_failed`, DLV/POD sem busca, e filtros de topo).

## Alterações (somente em `src/pages/air/TrackingAereo.tsx`)

### 1. `cardCounts` (linha 899)
Remover `hasMasterDiscrepancy(awb)` do cálculo de `critical`:
```
if (criticalCodes.has(code) || awb.pieces_discrepancy || stale) critical++;
```
(processo que só é "crítico" por troca de master deixa de ser contado).

### 2. Card filter "criticos" (linha 950)
Remover `hasMasterDiscrepancy(awb)`:
```
case "criticos": return awb.tracking_failed || ["NIL","NIF","OFLD"].includes(code) || awb.pieces_discrepancy || isStaleAwb(awb);
```

### 3. Badge da linha (rótulo "Crítico · Troca de master", ~linha 1443)
Quando o processo for crítico **apenas** por troca de master (sem stale, sem pieces_discrepancy, sem código crítico, sem tracking_failed), exibir o badge âmbar "Troca de master" em vez de "Crítico · Troca de master". Se houver também outra condição crítica real, mantém "Crítico" normal. Ajustar `isCritical` (linha 1221) para não incluir `hasMasterSwap`.

### 4. Contador do filtro "Troca de master" (linhas 1162-1165)
Calcular via `useMemo` aplicando as mesmas regras de visibilidade usadas em `filteredAwbs` (exceto `cardFilter` e o próprio `filterMasterSwap`), e depois `filter(hasMasterDiscrepancy)`. Exibir esse total no lugar de `discrepancies.length`.

```ts
const masterSwapVisibleCount = useMemo(() => {
  return awbsData.filter(awb => {
    const code = getStatusCode(awb.last_event).toUpperCase();
    if ((code === "DLV" || code === "POD") && !searchTerm) return false;
    if (awb.hide_reason) { /* mesma checagem de full match já existente */ return false; }
    if (!searchTerm && awb.arr_destino_date) { /* > 5 dias → false */ }
    if (awb.is_invalid && !searchTerm) return false;
    if (awb.tracking_failed && !searchTerm) return false;
    if (!applyTopFilters(awb)) return false;
    return hasMasterDiscrepancy(awb);
  }).length;
}, [awbsData, searchTerm, applyTopFilters, hasMasterDiscrepancy]);
```
Reaproveitar a mesma função extraindo a lógica de visibilidade para um helper local (`isAwbVisible`) e usá-lo tanto em `filteredAwbs` quanto neste contador, evitando divergência.

## Comportamento resultante
- Card "Críticos" volta a representar apenas falhas operacionais reais (NIL/NIF/OFLD, pieces_discrepancy, sem atualizações, tracking_failed).
- Botão "Troca de master" continua sendo o único caminho para ver/agir nesses casos, e o número exibido bate exatamente com o que aparece na lista quando o filtro é ativado.
- Nenhuma mudança em backend, edge functions ou regras de detecção de discrepância.
