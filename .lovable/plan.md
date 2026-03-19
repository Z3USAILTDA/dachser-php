

## Plano: Filtrar origem da detecção de conexão

### Problema

Na linha 1276 do `fetch-status-aereo/index.ts`, a lógica de conexão filtra apenas `airport !== dest`. Mas não filtra `airport !== origin`. Resultado: se um evento ARR acontece no aeroporto de **origem** (ex: AMS), ele é detectado como "conexão" porque `AMS ≠ GRU` — gerando rotas como `AMS → AMS → GRU`.

### Correção

**Arquivo:** `supabase/functions/fetch-status-aereo/index.ts`

**Linha 1276:** Adicionar checagem `airport !== origin` no filtro de conexão:

```typescript
// Antes:
if (airport && airport !== dest && !connectionAirports.includes(airport)) {

// Depois:
const origin = (origForClassify || '').trim().toUpperCase();
if (airport && airport !== dest && airport !== origin && !connectionAirports.includes(airport)) {
```

Nota: a variável `origin` já é declarada na linha 1283, mas precisa ser movida para antes do loop (linha 1270) para estar disponível no primeiro bloco de detecção.

### Arquivo modificado

1. `supabase/functions/fetch-status-aereo/index.ts` — adicionar filtro `!== origin` na detecção de conexão (linhas 1270-1280)

