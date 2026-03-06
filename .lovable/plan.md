

# Filtrar eventos da t_aereo_api com dataEvento null

## Problema

Quando a timeline usa dados de `t_aereo_api`, o campo `historico_status` contém eventos com `dataEvento: null` — esses são previsões de eventos futuros que ainda não ocorreram. Atualmente, na linha 6335, eventos sem data são mantidos com `return true`, fazendo com que essas previsões apareçam na timeline como se fossem reais.

## Correção

### `supabase/functions/mariadb-proxy/index.ts` — duas mudanças

**1. Linha 6225-6250 (mapeamento t_aereo_api)**: Marcar eventos de fonte API que não têm `dataEvento` com um flag para facilitar a filtragem:

Não precisa de flag — basta ajustar o filtro.

**2. Linha 6333-6343 (filteredEvents)**: Quando a fonte é `'API'` e `data_hora_evento` é null, excluir o evento (pois na t_aereo_api, null = não aconteceu ainda). Manter o `return true` apenas para fontes de tracking (firecrawl/ws) onde a ausência de data pode significar apenas parsing falho.

```typescript
const filteredEvents = validEvents.filter((e: any) => {
  if (!e.data_hora_evento) {
    // Para eventos da t_aereo_api, dataEvento null = não aconteceu ainda
    if (e.fonte === 'API') return false;
    return true; // outras fontes: manter por segurança
  }
  const eventDate = parseFlexibleDate(e.data_hora_evento);
  if (!eventDate) {
    if (e.fonte === 'API') return false;
    return true;
  }
  if (eventDate > now) return false;
  if (etdCutoff && eventDate < etdCutoff) return false;
  return true;
});
```

Uma mudança, um arquivo. Eventos da API sem data serão excluídos, mantendo apenas os que realmente aconteceram (como o BKD com `dataEvento: "2026-03-05T11:15:00"`).

