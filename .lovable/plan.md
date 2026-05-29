## Causa da falha

A tela `/sea/draft-exportacao` está chamando 3 edge functions que **foram deletadas** na conversa anterior (e que já deveriam ter sido substituídas pelo servidor Express externo, conforme a reestruturação descrita):

- `supabase.functions.invoke('draft-fetch-mariadb')` → `src/hooks/useDraftData.ts:53`
- `supabase.functions.invoke('draft-fetch-tracking-status')` → `src/hooks/useDraftData.ts:70`
- `supabase.functions.invoke('fetch-sea-master-dados-stats')` → `src/pages/sea/DraftExportacao.tsx:53`

Resultado: as 3 chamadas retornam `Failed to fetch` (functions não existem mais), o `Promise.all` rejeita, `combinedData` fica vazio → grid mostra "Nenhum dado disponível" e contadores em 0.

O frontend nunca foi atualizado para o endpoint único do Express (`/api/sea/draft-exportacao` e `/api/sea/draft-exportacao/stats`) descrito na reestruturação.

## Correção

### 1. `src/hooks/useDraftData.ts`
Substituir `fetchMBLs` + `fetchTrackingStatus` (2 invokes Supabase) por uma **única função `fetchCombined`** que faz `fetch('/api/sea/draft-exportacao')` e desestrutura `{ mbls, trackingStatus }` da resposta. O `Promise.all` no `refetch` deixa de existir — vira chamada única. Remover o import de `supabase`.

### 2. `src/pages/sea/DraftExportacao.tsx`
Trocar `supabase.functions.invoke('fetch-sea-master-dados-stats')` por `fetch('/api/sea/draft-exportacao/stats')`. Manter o shape de resposta esperado (`data.success` / `data.stats`).

### 3. Tratamento de erro
Preservar a regra do projeto: nenhum toast/banner visual em falha de conexão — apenas `console.error` (já está assim após o ajuste anterior).

## Fora do escopo

- Não mexer em `DraftDataGrid.tsx` nem `HapagTrackerPanel.tsx` — já usam `/api/sea/draft-exportacao/track/*` e `/save-tracking` corretamente.
- Não recriar as edge functions deletadas.
- Não alterar lógica de status, combineData, calculateStats.

Após aplicar, a tela deve voltar a popular MBLs/tracking via o servidor Express.
