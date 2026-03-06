

# Fix: AWBs com BKD aparecendo como "Em Trânsito" indevidamente

## Problema

A função `detectInTransit` na edge function `fetch-status-aereo` tem matching de descrição muito agressivo na linha 440:
```typescript
if (desc.startsWith('DEP') || desc.startsWith('MAN') || desc.startsWith('RCF') || desc.startsWith('ARR')) return true;
```

`desc.startsWith('MAN')` captura descrições como "MANUAL...", e `desc.startsWith('ARR')` pode capturar texto irrelevante. Além disso, o regex `/\bmanifested?\b/i` e `/\barrived?\b/i` podem capturar descrições de booking que mencionam destinos ou previsões (ex: "Booked BRU -> CWB" não deveria, mas "Booking Confirmed" também não). O principal problema é que o fallback para `apiRow.historico_status` propaga esses falsos positivos.

## Correção em `supabase/functions/fetch-status-aereo/index.ts`

### 1. Tornar matching de descrição mais rigoroso (linhas 437-442)

Remover os `startsWith` genéricos e manter apenas o matching por **código IATA exato** no campo `status`. O matching por descrição deve usar padrões mais específicos que exigem o código seguido de separador (` - `, espaço + localização):

```typescript
// Check description only for exact IATA-style patterns like "DEP - VCP" or "Departed from VCP"
const desc = (ev.Description || ev.description || ev.title || '').trim().toUpperCase();
if (desc) {
  // Match "DEP - ", "MAN - ", "RCF - ", "ARR - " (IATA code followed by separator)
  if (/^(DEP|MAN|RCF|ARR)\s*[-–]\s*/i.test(desc)) return true;
  // Match full words in context of actual transit descriptions
  if (/\bdeparted?\s+(from|at)\b/i.test(desc)) return true;
  if (/\bmanifested\s+(on|at|for)\b/i.test(desc)) return true;
  if (/\breceived\s+from\s+flight\b/i.test(desc)) return true;
  if (/\barrived?\s+(at|in)\b/i.test(desc)) return true;
}
```

### 2. Verificar `codigo_evento` field (campo usado pela timeline normalizada)

Adicionar check para `ev.codigo_evento` que é o campo usado pelos eventos normalizados do mariadb-proxy:

```typescript
const codigo = (ev.codigo_evento || '').trim().toUpperCase();
if (TRANSIT_CODES.has(codigo)) return true;
```

Isso garante que apenas AWBs com eventos reais de trânsito (DEP, MAN, RCF, ARR) na timeline sejam marcados como `in_transit`. O AWB 047-32916262 que tem evento real de trânsito antes do BKD continuará sendo detectado corretamente.

