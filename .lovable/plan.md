

## Plano: Corrigir coluna Data/Hora no /air/tracking-aereo

### Problema

A função `parseTimelineDateTime` (linha 182) espera datas com exatamente 3 partes (`"31 Mar 2026"`), mas os dados da API vêm com 4 partes (`"31 Mar 2026 23:00"` — dia, mês, ano, hora). O check `parts.length === 3` falha, o fallback `new Date("31 Mar 2026 23:00 00:00")` também falha, e retorna `null`.

### Alteração

**Arquivo: `src/pages/air/TrackingAereo.tsx`** — função `parseTimelineDateTime` (linha 182-196)

Adicionar suporte para 4 partes (quando o horário vem embutido no `dateStr`):

```typescript
function parseTimelineDateTime(dateStr: string, timeStr: string): string | null {
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length >= 3) {
    const [day, mon, year] = parts;
    const mm = MONTH_MAP[mon];
    if (mm) {
      const dd = day.padStart(2, "0");
      // Se tem 4+ partes, o horário está no dateStr (ex: "31 Mar 2026 23:00")
      const t = parts.length >= 4 ? parts[3] : (timeStr || "00:00");
      return `${year}-${mm}-${dd}T${t}:00`;
    }
  }
  // Fallback
  const d = new Date(`${dateStr} ${timeStr}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
```

Mudança: `parts.length === 3` → `parts.length >= 3`, e priorizar `parts[3]` como horário quando presente.

### Nenhum outro arquivo alterado

