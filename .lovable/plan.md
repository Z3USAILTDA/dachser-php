

## Plano: Usar Data/Hora da coluna para calcular SLA

### Problema Atual

O cálculo de `hours_in_status` usa `new Date(eventDate)` diretamente, que falha para vários formatos de data do MariaDB. Enquanto isso, a coluna "Data/Hora" usa `formatDateTimeBR(awb.last_event_date)` que internamente chama `parseDBDate` — um parser robusto que suporta múltiplos formatos. O SLA deveria usar o mesmo parser.

### Solução

**Arquivo: `src/pages/air/TrackingAereo.tsx`** — alterar o cálculo de `hours_in_status` (linhas 365-377) para:

1. Usar `parseDBDate` (já importado) em vez de `new Date()` para parsear a data
2. Manter o fallback para timeline se `last_event_date` estiver vazio
3. O `statusCode` já está disponível no escopo e é usado na renderização do SLA (linha 934) para determinar o threshold correto

```typescript
hours_in_status: (() => {
  let eventDate = item.last_event_date;
  if (!eventDate && Array.isArray(item.timeline_json) && item.timeline_json.length > 0) {
    for (const evt of item.timeline_json) {
      if (evt.date && evt.date.trim()) { eventDate = evt.date.trim(); break; }
    }
  }
  if (!eventDate) return null;
  const parsed = parseDBDate(eventDate);
  if (!parsed) return null;
  const diff = Date.now() - parsed.getTime();
  return diff > 0 ? diff / (1000 * 60 * 60) : null;
})(),
```

### Resumo
| Local | Alteração |
|-------|-----------|
| `TrackingAereo.tsx` linha 365-377 | Trocar `new Date()` por `parseDBDate()` no cálculo de `hours_in_status` |

Alteração de uma linha. `parseDBDate` já está importado no arquivo (linha 37). Sem mudanças no backend.

