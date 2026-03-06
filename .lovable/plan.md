

# Corrigir coluna "Data/Hora" — timeline_json está vazio no WS

## Diagnóstico

Investigação revelou que **todos** os registros de `t_aereo_ws_firecrawl` têm `timeline_json = "[]"` (array vazio). O scraper não está armazenando eventos na timeline. Isso faz com que `extractLastEventDate()` retorne `null` para todos os AWBs WS, caindo no fallback para `scraped_at`.

Porém, a tabela `t_aereo_api` possui `historico_status` com datas reais dos eventos (campo `dataEvento`). Exemplo para AWB `724-86856405`:
- BKD ZRH: `2026-03-05 12:12:42` (data real do evento)
- DEP AMS: `2026-03-07 09:50:00` (previsão futura, filtrada corretamente)

A `apiFallbackMap` já é carregada para TODOS os AWBs (linha 597-621), mas só é usada para o status — nunca para extrair a data do evento.

## Correção — `supabase/functions/fetch-status-aereo/index.ts`

### Única mudança: linha 823

Usar `apiRow.historico_status` como fallback quando o WS timeline está vazio:

```typescript
// Antes (linha 823):
last_event_date: extractLastEventDate(timelineStr, etdForTimeline),

// Depois:
last_event_date: extractLastEventDate(timelineStr, etdForTimeline) || 
  (apiRow?.historico_status 
    ? extractLastEventDate(
        typeof apiRow.historico_status === 'string' 
          ? apiRow.historico_status 
          : JSON.stringify(apiRow.historico_status), 
        etdForTimeline
      ) 
    : null),
```

`apiRow` já está definido na mesma scope (linha 759). A função `extractLastEventDate` já sabe parsear o formato API (`dataEvento`). Eventos futuros (previsões de voo) continuam filtrados, mostrando apenas a data do evento real mais recente.

Um arquivo, uma linha alterada.

