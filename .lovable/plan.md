

# Filtrar eventos com data futura da timeline

## Problema

A timeline mostra eventos com `data_hora_evento` no futuro (ex: ARR em 2026-03-08 quando hoje é 2026-03-06). Esses são previsões, não eventos reais. Para o AWB 724-13475593, apenas o FOH de 2026-03-05 deveria aparecer.

## Correção

### `supabase/functions/mariadb-proxy/index.ts` -- linhas 6333-6340

Adicionar filtro `eventDate <= now` junto ao filtro ETD existente:

```typescript
const now = new Date();
const filteredEvents = validEvents.filter((e: any) => {
  if (!e.data_hora_evento) return true;
  const eventDate = parseFlexibleDate(e.data_hora_evento);
  if (!eventDate) return true;
  // Excluir eventos com data futura (previsões)
  if (eventDate > now) return false;
  // Filtro ETD existente
  if (etdCutoff && eventDate < etdCutoff) return false;
  return true;
});
```

Uma mudança, um arquivo. Eventos futuros serão filtrados antes de chegar ao frontend.

