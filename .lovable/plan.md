

## Plano: Corrigir detecção de conexão na rota

### Diagnóstico

Identifiquei **3 bugs** na IIFE `conexao` do `fetch-status-aereo/index.ts` que fazem com que AWBs com status `ARR - CONEXÃO` mostrem `conexao: null`:

**Bug 1 — Regex não suporta `→` (seta unicode)**
As descrições de eventos usam `→` (unicode) como separador de rota, ex: `LA 5201-T (FRA→MAD) - DEP`. O regex atual só busca `-` (hífen):
```
/\b([A-Z]{3})-([A-Z]{3})\b/gi  ← não captura FRA→MAD
```

**Bug 2 — `\b` falha quando número cola no código IATA**
Descrições como `"Flight LA 8151LIS-FOR"` — o `\b` exige word boundary entre `1` e `L`, mas ambos são `\w`, então `\bLIS` não faz match.

**Bug 3 — Campo errado para status_info**
Linha 1294 usa `apiRow?.last_status_description` e `apiRow?.status_info`, mas o `apiRow` (de `t_aereo_api`) não tem esses campos — tem `ultimo_status`, `historico_status`, etc. Resultado: sempre string vazia. Deveria usar `ws.last_status_description`.

### Exemplo concreto

AWB `045-21167716`: origem=FOR, destino=GRU
- `status_info`: `"Flight Arrived. Flight LA 8151LIS-FOR, 20 / 637.50KGS"`
- `classifyArrival` detecta airport=FOR ≠ dest=GRU → `ARR - CONEXAO` ✅
- `conexao` IIFE falha: regex não captura `LIS-FOR` (por causa de `8151LIS`) e não captura `FRA→MAD` (por causa de `→`)

### Correções

**Arquivo:** `supabase/functions/fetch-status-aereo/index.ts` (linhas 1282-1301)

1. Trocar regex de `\b([A-Z]{3})-([A-Z]{3})\b` para `(?<![A-Z])([A-Z]{3})[-→\u2192]([A-Z]{3})(?![A-Z])` — suporta `→` e não exige word boundary alfabético
2. Corrigir referência: `apiRow?.last_status_description` → `ws.last_status_description`
3. Aplicar mesma correção no bloco de `status_info`

