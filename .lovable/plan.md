

# Usar data/hora do evento em vez de scraped_at na coluna "Data/Hora"

## Problema

A coluna "Data/Hora" mostra `última atualização` (que é `scraped_at` — quando o scraper coletou os dados), não a data/hora real do último evento de rastreio.

## Correção — 2 arquivos

### 1. Backend: `supabase/functions/fetch-status-aereo/index.ts`

Extrair a data do último evento válido da `timeline_json` e retorná-la como `last_event_date` no `baseRow` (linha ~741).

Criar uma função helper que:
- Parseia o `timeline_json`
- Ordena eventos por data DESC (mesmo padrão já usado em `resolveUnkFromTimeline`)
- Aplica filtro de ETD cutoff
- Retorna a data do primeiro evento válido (usando `ev.date || ev.Date || ev.timestamp || ev.Timestamp || ev.dataEvento`)

Adicionar ao `baseRow`:
```typescript
last_event_date: extractLastEventDate(timelineStr, etdForTimeline),
```

### 2. Frontend: `src/pages/Index.tsx`

**a)** Na conversão dos dados (linha ~545), mapear o novo campo:
```typescript
last_event_date: item.last_event_date || null,
```

**b)** Adicionar `last_event_date` ao tipo `AWBData` (linha ~375).

**c)** Na célula Data/Hora (linha ~2865), usar `last_event_date` com fallback para `last_check`:
```typescript
{formatDateTimeBR(awb.last_event_date || awb.last_check || awb.created_at)}
```

