# Por que processos não-entregues aparecem em "Entregues"

## Causa raiz

No `src/pages/ContainerTracking.tsx`, o card "Entregues" usa:

```ts
const isEntregue = (lastEvent) => {
  const status = getReportStatus(lastEvent);   // ← chama SEM container_status e SEM tipoProcesso
  return ['GOD','DLV'].includes(status.code);
};
```

`getReportStatus` só faz a distinção import × export quando recebe `tipoProcesso` (e somente para o caso `EMPTY_RECEIVED_AT_CY`). Como `isEntregue` passa apenas `lastEvent`, **toda lógica de export é ignorada** e eventos do início do ciclo de exportação são classificados como entrega:

| `last_event` real | Significado export | Mapeamento atual | Deveria ser |
|---|---|---|---|
| `EMPTY_RECEIVED_AT_CY` | Gate-in do vazio na origem (início) | **DLV** ✗ | GIO |
| `GATE_OUT_FULL` / `OUT_GATE` / "gate out" | Saída do cheio do terminal de origem rumo ao navio | **GOD** ✗ | CRG/DEP |
| `EMPTY_RETURN` / "empty return" | N/A em export | **DLV** ✗ | — |
| `CONTAINER_TO_CONSIGNEE` / "to consignee" | N/A em export | **GOD** ✗ | — |

Em importação, esses eventos realmente indicam entrega, então a regra atual funciona; o erro é exclusivo de **processos de exportação** que estão no início do ciclo. Isso explica por que o card mostra 10 entregues incluindo processos que ainda não foram entregues.

Confirmação adicional: na linha 2060 (e nas linhas 825-828) o cálculo das estatísticas e do filtro do card chama `isEntregue(m.last_event)` sem repassar `m.container_status` nem `m.tipo_processo`, perdendo todo o contexto que `getReportStatus` já sabe tratar.

## Correção proposta (cirúrgica)

1. **`isEntregue` passa a receber o MBL inteiro** (ou os 3 campos) e repassa para `getReportStatus`:
   ```ts
   const isEntregue = (m: MblTrackingData) =>
     ['GOD','DLV'].includes(
       getReportStatus(m.last_event, m.container_status, m.tipo_processo).code
     );
   ```

2. **Atualizar as 2 chamadas** existentes:
   - Linha 2060 (cálculo de `stats.entregues`): `filteredMblListByCarrier.filter(isEntregue)`
   - Linha 2058 (`emTransito` usa `!isEntregue(...)` também): passar o objeto `m`.
   - Linha 2023 (filtro do card "entregues" no `mbls.filter`): idem.

3. **Reforçar `getReportStatus` para export** — adicionar, logo após o bloco `checkEmptyAtCy` (linha 295), um guard que, quando `isExport === true`, **não** classifique como GOD/DLV os padrões `GATE_OUT_FULL`, `OUT_GATE`, `CONTAINER_TO_CONSIGNEE`, `EMPTY_RETURN(ED)`, nem os matches freeform "gate out", "to consignee", "empty return", "delivered". Para exportação esses casos devolvem o status anterior do ciclo (CRG/DEP) ou caem no fluxo padrão.

   Forma sugerida: criar um set `IMPORT_ONLY_DELIVERY_TOKENS` e, quando `isExport`, pular os ramos correspondentes nas linhas 270-278 e nos `includes` 311-312, 339-340.

## Escopo

- Arquivo único: `src/pages/ContainerTracking.tsx`.
- Sem mudanças de schema, backend ou edge function.
- Sem refactor de outras telas/hooks.

## Validação

- Após o fix, conferir no preview `/sea/tracking` que o contador "Entregues" cai (esperado: somente processos de import com GOD/DLV reais, ou export concluído via DCH/destino final conforme regra existente).
- Validar que processos export listados hoje como "Entregues" voltam para "Em Trânsito" / status correto.
