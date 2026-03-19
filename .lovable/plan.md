

## Plano: Corrigir detecção de transporte terrestre na timeline

### Problema
A função `extractFlightsFromText` (linha 1157) só extrai códigos de voo precedidos pela palavra "Flight" (regex: `/Flight\s+(...)/gi`). Porém, as descrições reais da timeline usam formatos sem esse prefixo:
- `"LA 5491-T (FRA→LIS) - DEP - 56 / 6170.50KGS"`
- `"AF0677D (BCN→?) - DEP - 1 piece departed"`
- `"M3 8516 (BRU→CWB) - MAN - Flight Manifested"`
- `"BKD - Booking Confirmed LA 5463-T FRA"`

Resultado: o campo `is_ground_transport` retorna `false` para processos que têm voos terrestres na timeline.

### Correção em `supabase/functions/fetch-status-aereo/index.ts`

**Expandir `extractFlightsFromText`** (linha ~1157) para capturar códigos de voo em qualquer posição do texto, não apenas após "Flight":

```typescript
function extractFlightsFromText(text: string): string[] {
  if (!text) return [];
  const flights: string[] = [];
  // Pattern 1: "Flight XX-1234X" or "Flight XX 1234X"
  const flightPattern = /Flight\s+([A-Z0-9]{2}[\s-]?\d{3,5}[A-Za-z]?)/gi;
  let m;
  while ((m = flightPattern.exec(text)) !== null) flights.push(m[1]);
  // Pattern 2: standalone airline codes like "LA 5491-T", "AF0677D", "M3 8516", "LX-9950X"
  const standalonePattern = /\b([A-Z]{2}\s?\d{3,5}-T)\b/gi;  // e.g. "LA 5491-T"
  while ((m = standalonePattern.exec(text)) !== null) flights.push(m[1]);
  const suffixPattern = /\b([A-Z0-9]{2}[\s-]?\d{3,5}[DXdx])\b/g;  // e.g. "AF0677D", "LX9950X"
  while ((m = suffixPattern.exec(text)) !== null) flights.push(m[1]);
  return flights;
}
```

Isso captura:
- `LA 5491-T` — sufixo `-T`
- `AF0677D` — sufixo `D` após dígito
- `LX-9950X` — sufixo `X` após dígito
- `M3 8516` — capturado pelo pattern original se precedido por "Flight", ou não é terrestre (sem sufixo)

### Resultado esperado
- Processos com voos terrestres na timeline (como `045-21167720`, `045-13300906`, `057-03727710`) exibirão o emoji 🚚 automaticamente
- Sem necessidade de overrides manuais para marcar transporte terrestre — a detecção automática funcionará

### Arquivo modificado
1. `supabase/functions/fetch-status-aereo/index.ts` — expandir regex em `extractFlightsFromText`

