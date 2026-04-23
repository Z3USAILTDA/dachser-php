

## Diagnóstico

A regra atual ainda permite que **qualquer evento da timeline** ou os campos `desc0..desc3` disparem o flag de RFS. Isso contamina processos cujo **último evento exibido** é aéreo, mas que tiveram um trecho rodoviário em algum momento da história.

A regra correta, conforme o usuário: **somente o último evento (o eleito por `pickTopByIATA`) pode determinar se o processo é rodoviário**. Sufixo `-T` ou `X/D` em qualquer outro evento deve ser ignorado para fins de classificação RFS.

## Correção

### 1. `supabase/functions/fetch-tracking-aereo/index.ts`
Substituir a detecção atual de `is_ground_transport` por uma checagem **escopada exclusivamente ao slot vencedor (`top.idx`)**:

```ts
// Após pickTopByIATA eleger top.idx
const electedEvent = timeline[top.idx] || {};

const electedFlightFields = [
  electedEvent.flight,
  electedEvent.Flight,
  electedEvent.voo,
  electedEvent.flight_number,
].filter(Boolean);

const electedTextFields = [
  electedEvent.description,
  electedEvent.details,
  electedEvent.status,
].filter(Boolean);

let isGround = electedFlightFields.some(hasGroundFlightPattern);

if (!isGround) {
  for (const txt of electedTextFields) {
    const flights = extractFlightsFromText(String(txt));
    if (flights.some(hasGroundFlightPattern)) { isGround = true; break; }
  }
}

const is_ground_transport = isGround;
```

Remover:
- Loop sobre **todos** os eventos da timeline.
- Fallback em `LAST_FLIGHT` quando não corresponde ao evento eleito.
- Fallback em `desc0..desc3` (são histórico SQL, não evento atual).

### 2. `supabase/functions/fetch-status-aereo/index.ts`
Espelhar exatamente a mesma lógica: detecção RFS apenas no evento eleito (mesmo `pickTopByIATA`/slot vencedor usado lá).

### 3. Manter intactos
- Regexes restritivos atuais (`-T` e `X/D` apenas).
- `MANUAL_OVERRIDES` com prioridade absoluta.
- Eleição via `pickTopByIATA` (sem mudança de hierarquia).

### 4. Atualizar memória
`mem://air/tracking/aereo-monitoring-spec`: adicionar regra explícita —

> **Escopo da detecção RFS**: apenas o evento eleito por `pickTopByIATA` (último evento exibido no card) é avaliado. Sufixo `-T` ou `X/D` em eventos antigos da timeline **não** classifica o processo como rodoviário. Campos `LAST_FLIGHT` e `desc0..desc3` não são mais usados como fallback.

## Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts`
- `supabase/functions/fetch-status-aereo/index.ts`
- `.lovable/memory/air/tracking/aereo-monitoring-spec.md`

## Validação
1. `045-13002511`, `045-22108925`, `045-21167985` (último evento sem sufixo): devem mostrar **avião**.
2. `045-21167904` (último evento com `LA 5462-T`): deve continuar mostrando **caminhão**.
3. Processo com último evento aéreo mas leg histórica `-T`: deve mostrar **avião** (mudança esperada de comportamento).
4. Processo cujo último evento real é rodoviário: deve mostrar **caminhão**.

## Riscos
- Sem alteração de schema.
- Processos atualmente marcados como rodoviários por herança histórica passarão a aéreos — comportamento desejado pelo usuário.
- Cobertura: se a fonte do voo rodoviário estiver fora dos campos do evento eleito (ex.: só em `LAST_FLIGHT` desatualizado), não será detectada — alinhado à regra "só o último evento conta".

