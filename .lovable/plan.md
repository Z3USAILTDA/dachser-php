

## Plano: Detectar conexão a partir de segmentos de voo (não apenas ARR)

### Problema

A detecção atual de `conexao` só funciona quando já existe um evento ARR na timeline com aeroporto diferente do destino. Porém, muitos AWBs mostram a conexão nos segmentos de voo dos eventos BKD/DEP/MAN (ex: `"AMS-ZRH"` quando destino é `GRU`), mas como ainda não têm ARR, a conexão não aparece na coluna Rota.

### Solução

**Arquivo:** `supabase/functions/fetch-status-aereo/index.ts` (linhas 1245-1282)

Expandir a IIFE `conexao` para, além de procurar ARR events, também extrair aeroportos intermediários dos segmentos de voo presentes nas descrições de BKD, DEP, MAN e outros eventos.

Lógica adicional (após a busca por ARR events, se nenhuma conexão foi encontrada):

1. Iterar por todos os eventos da timeline
2. Extrair segmentos de rota das descrições usando patterns como:
   - `Flight XX-NNNN, DD Mon YYYY, AAA-BBB` (ex: `LX-0737, 18 Mar 2026, AMS-ZRH`)
   - `AAA-BBB` em contexto de DEP/BKD/MAN
   - `Departed to BBB on Flight` / `Departed from AAA`
3. Coletar todos os aeroportos mencionados nas rotas
4. Se algum aeroporto intermediário (diferente de origem e destino) aparecer, esse é o aeroporto de conexão
5. Também verificar o campo `status_info` do registro principal, que frequentemente contém a rota do voo

### Exemplo concreto

AWB `724-86856405`: origem=AMS, destino=GRU
- status_info: `"Booked on Flight LX-0737, 18 Mar 2026, AMS-ZRH (BKD)"`
- O segmento `AMS-ZRH` indica que ZRH é conexão (não é o destino GRU)
- Resultado esperado: `conexao = "ZRH"`

### Implementação

Na IIFE `conexao` (linha 1245), após o loop de ARR events que retorna `null`, adicionar:

```typescript
// Fallback: extract connection from route segments in BKD/DEP/MAN descriptions
const origin = (origForClassify || '').trim().toUpperCase();
const routeAirports = new Set<string>();
for (const ev of events) {
  const desc = String(ev.Description || ev.description || ev.title || '');
  // Pattern: "AAA-BBB" route segments
  const routeMatches = desc.matchAll(/\b([A-Z]{3})-([A-Z]{3})\b/gi);
  for (const m of routeMatches) {
    routeAirports.add(m[1].toUpperCase());
    routeAirports.add(m[2].toUpperCase());
  }
}
// Also check status_info field
if (ws.last_status_description) {
  const siMatches = String(ws.last_status_description).matchAll(/\b([A-Z]{3})-([A-Z]{3})\b/gi);
  for (const m of siMatches) {
    routeAirports.add(m[1].toUpperCase());
    routeAirports.add(m[2].toUpperCase());
  }
}
// Remove origin and destination, stopwords
const stopWords = new Set(['THE','AND','FOR','NOT','KGS','PCS','QTY','AWB','AWR','BKD','DEP','ARR','MAN','RCS','RCF','NFD','DLV','PRE','DIS']);
routeAirports.delete(origin);
routeAirports.delete(dest);
for (const sw of stopWords) routeAirports.delete(sw);
// What remains are intermediate airports (connections)
if (routeAirports.size > 0) {
  return [...routeAirports][0];
}
```

### Arquivos modificados

1. `supabase/functions/fetch-status-aereo/index.ts` — expandir IIFE `conexao` com fallback de segmentos de rota

