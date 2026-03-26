

## Fix: `air-tracking-failed-alert` chama a edge function errada

### Causa raiz

A edge function `air-tracking-failed-alert` (linha 40) chama `fetch-status-aereo`, que usa a tabela `t_aereo_ws_firecrawl` (inexistente). Deveria chamar `fetch-tracking-aereo`, que usa `t_aereo_scraper`.

### Correção

**Arquivo:** `supabase/functions/air-tracking-failed-alert/index.ts`

Na função `fetchTrackingData()` (linha 40), trocar:

```typescript
// DE:
const resp = await fetch(`${supabaseUrl}/functions/v1/fetch-status-aereo`, {

// PARA:
const resp = await fetch(`${supabaseUrl}/functions/v1/fetch-tracking-aereo`, {
```

Nenhum outro arquivo será alterado.

