

# Plano: BKD com histórico de trânsito deve contar como "Em Trânsito"

## Problema

Em `supabase/functions/fetch-status-aereo/index.ts` (linhas 919-923), a lógica de `in_transit` faz um early-return `false` para qualquer AWB cujo status resolvido seja `BKD`, **antes** de verificar se a timeline contém eventos de trânsito (DEP, MAN, RCF, ARR).

## Solução

Remover `BKD` do conjunto `PRE_TRANSIT_STATUSES` na linha 920 e adicionar uma verificação específica: se o status for `BKD`, só retornar `in_transit = true` se `detectInTransit()` encontrar DEP/MAN/RCF/ARR na timeline.

### Alteração (1 arquivo)

**`supabase/functions/fetch-status-aereo/index.ts`** — linhas 919-933

De:
```typescript
const PRE_TRANSIT_STATUSES = new Set(['BKD', 'RCS', 'NEW', 'BOO', 'BOOKED', 'UNK', 'NIL', 'NIF', 'NOT_FOUND']);
const resolvedUpper = (finalStatus || '').toUpperCase();
if (PRE_TRANSIT_STATUSES.has(resolvedUpper)) return false;
return detectInTransit(timelineStr, etdForTimeline) || ...
```

Para:
```typescript
const PRE_TRANSIT_STATUSES = new Set(['RCS', 'NEW', 'BOO', 'BOOKED', 'UNK', 'NIL', 'NIF', 'NOT_FOUND']);
const resolvedUpper = (finalStatus || '').toUpperCase();
// BKD só é in_transit se a timeline tiver eventos DEP/MAN/RCF/ARR anteriores
if (PRE_TRANSIT_STATUSES.has(resolvedUpper)) return false;
// Para BKD: verificar se houve trânsito real na timeline
const hasTransitHistory = detectInTransit(timelineStr, etdForTimeline) || 
  (apiRow?.historico_status ? detectInTransit(...) : false);
if (resolvedUpper === 'BKD') return hasTransitHistory;
return hasTransitHistory;
```

A função `detectInTransit` já faz exatamente o que é necessário — procura por DEP, MAN, RCF, ARR na timeline. Basta deixar ela rodar para processos BKD.

