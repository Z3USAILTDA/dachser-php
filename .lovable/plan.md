

## Plano: Ajustes no Rastreio Aéreo (4 itens)

### 1. "Último Status" = evento cronologicamente mais recente da timeline

**Arquivo**: `supabase/functions/fetch-status-aereo/index.ts`

**Problema**: `resolveUnkFromTimeline` (linhas 349-389) itera TODOS os eventos filtrados e retorna o de maior `IATA_HIERARCHY` — o status mais "avançado" na cadeia logística, não o mais recente no tempo.

**Correção**: Substituir o loop de hierarquia (linhas 360-384) por simplesmente resolver o **primeiro evento** do array `filtered` (já ordenado por data DESC + IATA tiebreaker para mesmo timestamp). Isso garante que o `último_status` reflita sempre o evento mais recente da timeline.

```
// ANTES: loop buscando bestOrder em TODA a timeline
// DEPOIS: resolver apenas filtered[0]
const resolved = resolveEvent(filtered[0]);
if (resolved) return resolved;
// fallback: tentar os próximos se o primeiro não resolver
for (const ev of filtered.slice(1)) {
  const r = resolveEvent(ev);
  if (r) return r;
}
return null;
```

### 2. "Delivery" = DLV direto

**Arquivo**: `supabase/functions/fetch-status-aereo/index.ts`

- Linha 191 no `statusMap`: adicionar `'DELIVERY': 'DLV'`
- Nos `descPatterns` (após linha 240 `delivered`): adicionar `/^delivery$/i` → `'DLV'` (exact match para não conflitar com "notified for delivery" / "awaiting delivery")

### 3. "Documents Received" = RCD

**Arquivo**: `supabase/functions/fetch-status-aereo/index.ts`

- Linha 214: mudar `'DOCUMENTS RECEIVED': 'AWR'` → `'DOCUMENTS RECEIVED': 'RCD'`
- Linha 262: mudar `/\bdocuments?\s+received\b/i` de `'AWR'` para `'RCD'`
- Linha 218: adicionar `'RCD'` ao array `knownIataCodes`
- Linhas 350-358 (`IATA_HIERARCHY`): adicionar `'RCD': 7`
- Linhas 415-425 (`IATA_ORDER`): adicionar `'RCD': 7`

### 4. Indicador "Tráfego Terrestre" quando flight contém "-T"

**Backend** (`fetch-status-aereo/index.ts`, ~linha 1150 no `baseRow`):
- Extrair o flight do último evento da timeline (campo `flight` ou `Flight` ou `voo`)
- Se contém `-T` (ex: "LA 5252-T"), adicionar `is_ground_transport: true`

**Frontend** (`src/pages/Index.tsx`):
- Adicionar `is_ground_transport?: boolean` ao `AWBData` (linha ~418)
- Mapear na conversão (linha ~593): `is_ground_transport: item.is_ground_transport || false`
- Na célula do AWB (linhas ~2694-2706), adicionar badge âmbar "🚚 Terrestre" quando `is_ground_transport === true`, similar ao badge "Novo Master"

### Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/fetch-status-aereo/index.ts` | Lógica cronológica, RCD, DLV, ground transport |
| `src/pages/Index.tsx` | `is_ground_transport` no AWBData + badge |

