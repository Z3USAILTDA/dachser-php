

## Plano: Corrigir parsing da coluna Data/Hora no Tracking Aéreo

### Problema

O `last_event_date` retornado pelo edge function `fetch-tracking-aereo` vem no formato `"31 Mar 2026 23:00"` (texto humano). A função `parseDBDate` em `src/utils/timezone.ts` só reconhece formatos ISO (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm:ss`) e MariaDB (`YYYY-MM-DD HH:mm:ss`). O formato textual cai no fallback `new Date("31 Mar 2026 23:00")` que pode retornar `Invalid Date` dependendo do runtime, resultando em `'—'` na tela.

### Solução

Adicionar um branch no `parseDBDate` (em `src/utils/timezone.ts`, antes do fallback na linha ~91) para reconhecer o formato `"DD Mon YYYY HH:MM"` usando regex e mapeamento de meses em inglês:

```typescript
// Human-readable format: "31 Mar 2026 23:00"
const humanMatch = dateStr.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})$/);
if (humanMatch) {
  const months: Record<string, number> = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
  const [, day, mon, year, hour, min] = humanMatch;
  const monthIdx = months[mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase()];
  if (monthIdx !== undefined) {
    return new Date(parseInt(year), monthIdx, parseInt(day), parseInt(hour), parseInt(min));
  }
}
```

### Arquivo alterado
- `src/utils/timezone.ts` — função `parseDBDate` (~linha 88, antes do fallback)

