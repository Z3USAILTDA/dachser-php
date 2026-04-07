

## Plano: Suporte a todos os formatos de data possíveis no `parseDBDate`

### Problema
O parser atual não reconhece formatos textuais como `"15 Mar 2026 10:52"`, datas em formato BR `"31/03/2026"`, timestamps Unix, nem variações com meses por extenso. Isso causa `Invalid Date` e colunas vazias.

### Alteração

**`src/utils/timezone.ts`** — inserir bloco de detecção multi-formato **antes** da linha 72 (`if (dateStr.includes(' '))`), e adicionar fallbacks no final:

```typescript
// === NOVOS FORMATOS (inserir antes da linha 72) ===

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  // Português
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

// 1) "DD Mon YYYY HH:MM" / "DD Mon YYYY" (Firecrawl/timeline)
const textMatch = dateStr.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
if (textMatch) {
  const mm = MONTH_MAP[textMatch[2].substring(0, 3)];
  if (mm) {
    const dd = textMatch[1].padStart(2, "0");
    const time = textMatch[4] || "00:00";
    return new Date(`${textMatch[3]}-${mm}-${dd}T${time}:00${TIMEZONE_CONFIG.offsetString}`);
  }
}

// 2) "Mon DD, YYYY" / "March 15, 2026" (inglês longo)
const enLongMatch = dateStr.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
if (enLongMatch) {
  const mm = MONTH_MAP[enLongMatch[1].substring(0, 3)];
  if (mm) {
    const dd = enLongMatch[2].padStart(2, "0");
    const time = enLongMatch[4] || "00:00";
    return new Date(`${enLongMatch[3]}-${mm}-${dd}T${time}:00${TIMEZONE_CONFIG.offsetString}`);
  }
}

// 3) "DD/MM/YYYY HH:mm" ou "DD/MM/YYYY" (formato BR)
const brMatch = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/);
if (brMatch) {
  const dd = brMatch[1].padStart(2, "0");
  const mm = brMatch[2].padStart(2, "0");
  const time = brMatch[4] || "00:00:00";
  return new Date(`${brMatch[3]}-${mm}-${dd}T${time}${TIMEZONE_CONFIG.offsetString}`);
}

// 4) "DD-MM-YYYY" ou "DD.MM.YYYY" (europeu)
const euMatch = dateStr.trim().match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/);
if (euMatch) {
  const dd = euMatch[1].padStart(2, "0");
  const mm = euMatch[2].padStart(2, "0");
  const time = euMatch[4] || "00:00:00";
  return new Date(`${euMatch[3]}-${mm}-${dd}T${time}${TIMEZONE_CONFIG.offsetString}`);
}

// 5) "YYYY/MM/DD HH:mm:ss" (alternativo ISO com /)
const altIsoMatch = dateStr.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/);
if (altIsoMatch) {
  const mm = altIsoMatch[2].padStart(2, "0");
  const dd = altIsoMatch[3].padStart(2, "0");
  const time = altIsoMatch[4] || "00:00:00";
  return new Date(`${altIsoMatch[1]}-${mm}-${dd}T${time}${TIMEZONE_CONFIG.offsetString}`);
}

// 6) Timestamp Unix (numérico puro — segundos ou milissegundos)
if (/^\d{10,13}$/.test(dateStr.trim())) {
  const ts = parseInt(dateStr.trim(), 10);
  return new Date(ts < 1e12 ? ts * 1000 : ts);
}
```

Também melhorar o **fallback final** (linha ~91) para validar antes de retornar:

```typescript
// Fallback: try native parsing, validate result
const fallback = new Date(dateStr);
return isNaN(fallback.getTime()) ? null : fallback;
```

### Formatos cobertos (resumo)
| # | Formato | Exemplo |
|---|---------|---------|
| 1 | DD Mon YYYY HH:MM | `15 Mar 2026 10:52` |
| 2 | Month DD, YYYY | `March 15, 2026` |
| 3 | DD/MM/YYYY HH:mm | `31/03/2026 14:30` |
| 4 | DD-MM-YYYY / DD.MM.YYYY | `31-03-2026`, `31.03.2026` |
| 5 | YYYY/MM/DD | `2026/03/31 14:30` |
| 6 | Unix timestamp | `1775592818562` |
| Z | ISO com Z (existente) | `2026-01-14T22:09:31.000Z` |
| SP | MariaDB datetime (existente) | `2026-01-14 22:09:31` |
| ISO | Date-only (existente) | `2026-01-14` |

### Arquivo alterado
- `src/utils/timezone.ts` — 6 novos blocos de parsing + fallback seguro

