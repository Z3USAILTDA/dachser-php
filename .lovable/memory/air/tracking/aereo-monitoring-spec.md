---
name: Air Monitoring Spec
description: Deduplication, ARR sub-classification, SLA SQL logic, ground transport (RFS) detection
type: feature
---

Tracking aéreo (/air/tracking-aereo): deduplicação, sub-classificação ARR, lógica SLA SQL.

## Detecção de Transporte Rodoviário (RFS)

Detecção restrita a sinais inequívocos em campos estruturados de voo:

1. **Sufixo `-T` explícito**: `\b[A-Z]{2,3}\s?\d{2,5}-T\b` (ex.: `LA 5462-T`)
2. **Notação literal `X/D`**: `\b[A-Z]{2,3}\s?\d{2,5}\s*X\s*\/\s*D\b` (ex.: `XX 1234 X/D`)

**Descontinuado**: o sufixo solo `X` ou `D` no fim do número de voo (`\d{2,5}[XD]`) foi removido — gerava falsos positivos quando descrições de timeline continham palavras como `DEP`, `DLV`, `DFW`, `MAO`, `Departed`.

**Sem fallback de `JSON.stringify(timeline)`**: o scan cego sobre o JSON serializado da timeline foi removido. Detecção apenas em campos estruturados:
- `LAST_FLIGHT` / `last_flight`
- Campos `flight`/`Flight`/`voo`/`flight_number` por evento
- Campos texto `status`/`description`/`details` por evento (via `extractFlightsFromText` que extrai apenas padrões inequívocos)

Aplicado em `supabase/functions/fetch-tracking-aereo/index.ts` e `supabase/functions/fetch-status-aereo/index.ts`.
