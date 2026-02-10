
## Detectar ARR Conexao vs ARR Destino usando a Timeline

### Objetivo
Usar os dados da timeline (`timeline_json`) junto com o campo `destination` do `t_aereo_ws` para determinar automaticamente se o ultimo evento ARR e uma chegada na conexao ou no destino final.

### Logica de Deteccao (Backend)

O campo `destination` do `t_aereo_ws` contem o aeroporto de destino final (ex: "GRU"). Na timeline, os eventos ARR geralmente incluem o aeroporto onde ocorreu a chegada na descricao ou em campo dedicado.

A funcao no backend vai:
1. Verificar se o `last_status_code` e `ARR`
2. Parsear o `timeline_json` para encontrar o ultimo evento ARR
3. Extrair o aeroporto do evento ARR (da descricao ou campo `airport`/`station`)
4. Comparar com o `destination` do AWB:
   - Se o aeroporto do ARR == destination -> `"ARR - DESTINO"`
   - Se o aeroporto do ARR != destination -> `"ARR - CONEXAO"`
   - Se nao conseguir determinar o aeroporto -> manter `"ARR"` generico

### Alteracoes

#### 1. Backend: `supabase/functions/fetch-status-aereo/index.ts`

Adicionar uma funcao `classifyArrival(lastStatusCode, timelineJson, destination)` que:
- Retorna o `last_status_code` original se nao for ARR
- Se for ARR, parseia a timeline para encontrar o evento ARR mais recente
- Extrai o aeroporto do evento via regex (ex: `"Arrived at GRU"`, `"ARR - GRU"`, campo `station`, campo `airport`)
- Compara com `destination` e retorna `"ARR - DESTINO"` ou `"ARR - CONEXAO"`

O campo `ultimo_status` no response ja sera retornado com o sufixo correto.

#### 2. Frontend: `src/pages/Index.tsx`

Nenhuma mudanca estrutural necessaria no frontend, pois:
- `getStatusCode()` ja reconhece `"ARR - DESTINO"` e `"ARR - CONEXAO"` (linhas 240-241, 245-248)
- `getStatusFromEvent()` ja traduz ambos (linhas 1731-1738)
- O progress map e os badges ja tratam esses valores

A unica alteracao no frontend sera garantir que o mapeamento no `fetchStatusAereoData` propague o valor enriquecido do `ultimo_status` corretamente (o que ja acontece hoje).

### Secao Tecnica

**Regex para extrair aeroporto do evento ARR na timeline:**
- Campo `station` ou `airport` do evento JSON (acesso direto)
- Descricao: `/(?:arrived?\s+(?:at|in)\s+)([A-Z]{3})/i`
- Descricao: `/\b([A-Z]{3})\b/` como fallback (3 letras maiusculas)
- Campo `location` do evento

**Comparacao:**
- Case-insensitive, trim de espacos
- Se o aeroporto extraido for igual ao `destination` -> DESTINO
- Se diferente -> CONEXAO
- Se nao encontrado -> manter ARR sem sufixo

**Arquivos modificados:**
1. `supabase/functions/fetch-status-aereo/index.ts` - nova funcao `classifyArrival` + aplicar no campo `ultimo_status` do baseRow
2. `src/pages/Index.tsx` - ajustes minimos se necessarios (ex: tooltip do ponto ARR na regua)
