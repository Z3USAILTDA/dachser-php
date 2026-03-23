

## Plano: Corrigir erro "etdForTimeline is not defined"

### Problema

A edição anterior removeu a declaração da variável `etdForTimeline` mas deixou 6 referências a ela no código:
- Linha 1244, 1250: `detectInTransit(timelineStr, etdForTimeline)`
- Linha 1256, 1262: `extractLastEventDate(timelineStr, etdForTimeline)`
- Linha 1339, 1345: `extractLastEventDate(timelineStr, etdForTimeline)` (para `hours_in_status`)

### Solução

Adicionar a declaração de `etdForTimeline` de volta, logo após a linha 1087 (onde `etdForDiscrepancy` já é declarado). Como o objetivo do plano anterior era **não filtrar por ETD na resolução de status**, mas essas funções (`detectInTransit`, `extractLastEventDate`) ainda precisam do ETD para outros cálculos (transit detection, event date extraction), a variável deve ser restaurada:

```typescript
const etdForTimeline = masters && masters.length > 0 ? (masters[0].etd || null) : null;
```

Isso corrige o erro 500 sem reverter a simplificação de status já implementada.

### Alteração

**Arquivo: `supabase/functions/fetch-status-aereo/index.ts`**
- Adicionar `const etdForTimeline = ...` na linha ~1088, antes do bloco de resolução de status

