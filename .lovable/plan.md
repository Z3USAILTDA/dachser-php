

## Problema

AWBs que possuem dados válidos na `t_aereo_ws_firecrawl` (com `timeline_json` contendo eventos) estão sendo marcados como `tracking_failed: true` porque o `resolveUnkFromTimeline` não consegue mapear os eventos para um código IATA reconhecido (retorna `null`), e as outras fontes (API, ws.last_status_code) também não têm status válido.

A lógica atual (linha 994): `tracking_failed: !finalStatus` — se `finalStatus` é null, marca como falha. Mas o AWB tem timeline com eventos reais, apenas com formatos de descrição que não casam com os padrões conhecidos.

## Solução

### Backend: `supabase/functions/fetch-status-aereo/index.ts`

**1. Criar helper para verificar se timeline tem eventos válidos** (antes do loop de merge):

```typescript
function timelineHasValidEvents(timelineJson: string | null): boolean {
  if (!timelineJson) return false;
  if (isTimelineError(timelineJson)) return false;
  try {
    const events = JSON.parse(timelineJson);
    return Array.isArray(events) && events.length > 0;
  } catch { return false; }
}
```

**2. No bloco de resolução de status (~linhas 948-966)**, quando nenhuma fonte retorna status válido, mas a timeline tem eventos, usar `last_status_code` do ws como está (mesmo que seja UNK) em vez de null:

```typescript
// Antes do "Final guard" (linha 968):
// Se não temos status mas timeline tem eventos reais, usar o raw ws status
if (!finalStatus && timelineHasValidEvents(timelineStr)) {
  // Fallback: usar o último status bruto do ws, ou 'EM RASTREIO'
  const rawWs = (ws.last_status_code || '').trim().toUpperCase();
  if (rawWs && rawWs !== 'UNK' && !invalidStatuses.has(rawWs)) {
    finalStatus = rawWs;
  } else {
    finalStatus = 'EM RASTREIO'; // status genérico indicando que há dados
  }
  console.log(`[timelineSafety] ${awb}: timeline has events but no resolved status, using "${finalStatus}"`);
}
```

**3. No "Final guard" UNK (linha 968-972)**, aplicar a mesma lógica: se status é UNK mas timeline tem eventos, usar 'EM RASTREIO' em vez de marcar como falha:

```typescript
if (finalStatus && finalStatus.toUpperCase() === 'UNK') {
  if (timelineHasValidEvents(timelineStr)) {
    finalStatus = 'EM RASTREIO';
    console.log(`[unkGuard] ${awb}: UNK with valid timeline, using "EM RASTREIO"`);
  } else {
    finalStatus = null;
    console.log(`[unkGuard] ${awb}: resolved to UNK with no timeline, marking as tracking failed`);
  }
}
```

**4. Frontend: `src/pages/StatusAereoList.tsx`** — adicionar badge para 'EM RASTREIO' com cor amarela/warning:

```typescript
: item.último_status === 'EM RASTREIO'
? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300'
```

### Resultado
- AWBs com `timeline_json` válido nunca serão marcados como "Falha no rastreio"
- Em vez disso, mostrarão "EM RASTREIO" (badge amarelo) indicando que há dados mas o status exato não foi identificado
- A coluna "Status Info" continuará mostrando a descrição do último evento da timeline
- AWBs realmente sem dados (sem timeline ou com erros) continuam como "Falha no rastreio"

