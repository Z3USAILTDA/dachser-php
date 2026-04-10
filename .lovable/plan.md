

## Diagnóstico: SLA ainda vazio para alguns processos

### Causa Raiz

O cálculo de `hours_in_status` depende de `item.last_event_date`, que é `null` em dois cenários:

1. **Sem timeline**: O LEFT JOIN com `t_fato_aereo` não encontra correspondência → TIMELINE é null → nenhuma data disponível
2. **Data em formato não-parseável**: O `dateStr` vem do timeline (ex: `"10 Apr 2026"`, `"2026-04-10 14:30"`) e `new Date(dateStr)` pode retornar `NaN` para alguns formatos → `diff` é NaN → retorna `null`

### Solução

**Arquivo: `src/pages/air/TrackingAereo.tsx`** — tornar o cálculo mais robusto:

1. **Tentar parsear a data com fallbacks** — se `new Date()` falha, tentar formatos comuns (DD MMM YYYY, DD/MM/YYYY)
2. **Usar a data do primeiro evento da timeline como fallback** — se `last_event_date` é null mas a timeline tem eventos com data, extrair de lá
3. **Proteger contra NaN** — verificar `isNaN` antes de retornar

```typescript
hours_in_status: (() => {
  let eventDate = item.last_event_date;
  // Fallback: try first timeline event date
  if (!eventDate && Array.isArray(item.timeline_json) && item.timeline_json.length > 0) {
    for (const evt of item.timeline_json) {
      if (evt.date && evt.date.trim()) { eventDate = evt.date.trim(); break; }
    }
  }
  if (!eventDate) return null;
  const parsed = new Date(eventDate).getTime();
  if (isNaN(parsed)) return null;
  const diff = Date.now() - parsed;
  return diff > 0 ? diff / (1000 * 60 * 60) : null;
})(),
```

### Resumo
| Local | Alteração |
|-------|-----------|
| `TrackingAereo.tsx` mapeamento | Fallback para timeline + proteção contra NaN |

Uma alteração cirúrgica, sem mudanças no backend.

