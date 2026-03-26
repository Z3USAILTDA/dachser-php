

## Fix: Data/Hora vazia — parsing de data textual

### Causa raiz

O backend retorna datas no formato `"24 Mar 2026"` e o código monta `"24 Mar 2026T06:07:00"` — que **não é um formato ISO válido** para `new Date()`. Por isso `new Date(lastEventDate)` retorna `NaN` e a coluna fica vazia.

### Solução

**Arquivo:** `src/pages/air/TrackingAereo.tsx`

Adicionar um helper `parseTextualDate` que converte `"24 Mar 2026"` + `"06:07"` em `"2026-03-24T06:07:00"`:

```typescript
const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseTimelineDateTime(dateStr: string, timeStr: string): string | null {
  // Format: "24 Mar 2026"
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length === 3) {
    const [day, mon, year] = parts;
    const mm = MONTH_MAP[mon];
    if (mm) {
      const dd = day.padStart(2, "0");
      const t = timeStr || "00:00";
      return `${year}-${mm}-${dd}T${t}:00`;
    }
  }
  // Fallback: try as-is
  const d = new Date(`${dateStr} ${timeStr}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
```

Substituir as linhas 296-303 para usar este helper em vez da concatenacao direta:

```typescript
if (timeline.length > 0) {
  const evt = timeline.find((e: any) => e.date);
  if (evt) {
    lastEventDate = parseTimelineDateTime(evt.date || "", evt.time || "00:00");
  }
}
```

Nenhum outro arquivo será alterado.

