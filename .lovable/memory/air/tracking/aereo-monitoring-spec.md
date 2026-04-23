---
name: Air Monitoring Spec
description: Deduplication, ARR sub-classification, SLA SQL logic, ground transport (RFS) detection
type: feature
---

Tracking aéreo (/air/tracking-aereo): deduplicação, sub-classificação ARR, lógica SLA SQL.

## Detecção de Transporte Rodoviário (RFS)

### Padrões aceitos

Detecção restrita a sinais inequívocos em campos estruturados de voo:

1. **Sufixo `-T` explícito**: `\b[A-Z]{2,3}\s?\d{2,5}-T\b` (ex.: `LA 5462-T`)
2. **Notação literal `X/D`**: `\b[A-Z]{2,3}\s?\d{2,5}\s*X\s*\/\s*D\b` (ex.: `XX 1234 X/D`)

**Descontinuado**: o sufixo solo `X` ou `D` no fim do número de voo (`\d{2,5}[XD]`) foi removido — gerava falsos positivos quando descrições de timeline continham palavras como `DEP`, `DLV`, `DFW`, `MAO`, `Departed`.

### Escopo da detecção (regra crítica)

A classificação RFS avalia **somente o evento eleito como "último evento" do card** — nunca o histórico completo. Sufixo `-T` ou `X/D` em eventos antigos da timeline **não** classifica o processo como rodoviário. Campos `LAST_FLIGHT` / `ws.last_flight` e `desc0..desc3` **não** são usados como fallback (podem estar desatualizados ou refletir legs históricas).

- **`fetch-tracking-aereo`**: escopo = slot vencedor de `pickTopByIATA` (`top.idx`). Testa `top.desc` e, se a timeline contiver o evento correspondente (match por `date` ou `description`), seus campos `flight`/`Flight`/`voo`/`flight_number` e textos `status`/`description`/`details`/`title`/`details`.
- **`fetch-status-aereo`**: escopo = `sorted[0]` da timeline ordenada por data DESC (mesmo evento usado para resolver `finalStatus`). Mesmos campos estruturados acima.

Em ambos: detecção via `hasGroundFlightPattern` (regex direto) e `extractFlightsFromText` (extração de padrões inequívocos). Sem `JSON.stringify(timeline)`, sem varredura global, sem fallback em campos SQL agregados.
