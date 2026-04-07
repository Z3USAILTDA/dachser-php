

## Plano: Corrigir coluna Data/Hora definitivamente

### Causa raiz

A linha 273 do edge function monta `last_event_date` apenas a partir de `date0` e `time0`, que são extraídos via SQL de `$[0].date` e `$[0].time` (o primeiro evento da timeline). Porém, os eventos mais recentes (índice 0) frequentemente têm `"date": ""` — as datas só aparecem em eventos mais antigos (índice 5, 10, etc.).

Resultado: `last_event_date` é `null` ou `""` para a maioria dos processos.

### Solução

No edge function `fetch-tracking-aereo/index.ts`, após o parse da timeline (linha ~217-222), percorrer a timeline e extrair a **primeira data não-vazia** encontrada. Usar esse valor como `last_event_date` em vez de depender apenas de `date0`/`time0` do SQL.

**Lógica (substituir linha 273):**

```typescript
// Find the first non-empty date in the timeline
let dateStr: string | null = null;
if (timeline && timeline.length > 0) {
  for (const evt of timeline) {
    const d = (evt.date || "").trim();
    if (d) {
      dateStr = d;
      break;
    }
  }
}
// Fallback to SQL-extracted date0/time0
if (!dateStr) {
  dateStr = ((row.date0 || "") + " " + (row.time0 || "")).trim() || null;
}
```

### Arquivo alterado
- `supabase/functions/fetch-tracking-aereo/index.ts` — substituir linha 273 pela lógica de busca na timeline

### Resultado esperado
- A coluna Data/Hora exibirá a data do evento mais recente disponível na timeline
- Funciona mesmo quando os primeiros eventos não têm data preenchida
- O parsing no front-end (`parseDBDate`) já suporta o formato `"31 Mar 2026 23:00"`

