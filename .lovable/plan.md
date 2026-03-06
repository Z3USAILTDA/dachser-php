

# Fix: Status não atualiza quando timeline tem eventos mas last_status_code é UNK

## Problemas identificados

1. **`resolveEvent` não verifica `codigo_evento`**: A função `resolveEvent` (usada por `resolveUnkFromTimeline` para resolver o status final) verifica apenas `ev.status` e `ev.Description`. O campo `ev.codigo_evento` (usado pelos eventos normalizados do mariadb-proxy) é ignorado. Resultado: se um evento tem `codigo_evento: "DEP"` mas `status` vazio e descrição não-matching, o status fica como UNK.

2. **Alerta (DIS) não é removido quando há status posterior**: Se o mais recente evento resolvido é DIS, a lógica atual só o substitui se encontrar outro evento dentro de 24h. Se o novo evento for posterior a 24h do DIS, o DIS prevalece incorretamente.

## Correções em `supabase/functions/fetch-status-aereo/index.ts`

### 1. Adicionar `codigo_evento` ao `resolveEvent` (linhas ~283-309)

No início da função `resolveEvent`, antes de verificar `ev.status`, checar `ev.codigo_evento`:

```typescript
function resolveEvent(ev: any): string | null {
  // Check codigo_evento first (normalized events from mariadb-proxy)
  const codigoEvento = (ev.codigo_evento || '').trim().toUpperCase();
  if (codigoEvento && statusMap[codigoEvento]) return statusMap[codigoEvento];
  if (codigoEvento && knownIataCodes.includes(codigoEvento)) return codigoEvento;

  // ... rest of existing logic
}
```

### 2. Remover limite de 24h para superseder DIS (linhas ~311-348)

Simplificar a lógica: se o evento mais recente é DIS, verificar se QUALQUER evento posterior (mais recente na timeline) com status diferente de DIS existe — se sim, usar esse status. Remover a restrição de 24h:

```typescript
// If first resolved is NOT DIS, return immediately
if (firstResolved !== 'DIS') return firstResolved;

// DIS is most recent — but check if a non-DIS event exists AFTER it chronologically
// (events are sorted DESC, so continue iterating for older events that 
//  might have been added later or concurrent)
// Actually: the fix is simpler — just return firstResolved (DIS) and handle 
// the "Em Alerta" filtering on the frontend/final status logic
```

Na verdade, o problema do DIS não é a resolução da timeline — é que quando o mais recente evento real é posterior ao DIS, ele deveria ser o `firstResolved`. Se o DIS aparece como primeiro, significa que é genuinamente o mais recente. O fix correto é: remover a restrição de 24h para que qualquer evento não-DIS na mesma iteração (posterior ao DIS) prevaleça.

### 3. Garantir que UNK final seja substituído pela timeline

Na lógica final (linhas 856-873), adicionar fallback extra: se `finalStatus` ainda é UNK/inválido após todas as fontes, tentar usar `extractIataFromDesc` na `last_status_description` do ws:

```typescript
// After all resolution, if still UNK, try last_status_description
if (!finalStatus || invalidStatuses.has((finalStatus || '').toUpperCase())) {
  const descStatus = extractIataFromDesc(ws.last_status_description || '');
  if (descStatus) finalStatus = descStatus;
}
```

## Resultado esperado
- AWBs com `last_status_code = UNK` mas eventos reais na timeline mostrarão o status correto
- AWBs com DIS seguido de novo evento não ficarão presos em "Em Alerta"

