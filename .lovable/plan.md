

# Fix: mapColumns picks wrong columns due to left-to-right first-match logic

## Root cause

The `mapColumns` function (lines 142-169) iterates headers left-to-right and stops at the **first** partial match. This causes:

| Field       | Mapped to (WRONG)         | Should be (CORRECT)        |
|-------------|--------------------------|---------------------------|
| supplier    | Col 2: "Supplier Country" | Col 3: "Supplier Name"    |
| description | Col 17: "QTY Material"    | Col 18: "ZF Part Description" |

Evidence from logs:
```
supplier col: 2, weight col: 8, ncm col: 20, desc col: 17
Row 12: supplier="PL", weight=965226
Row 16: supplier="DE", weight=2482000
```

"PL" and "DE" are country codes, not supplier names. Weights are absurd because rows are grouped by country.

## Fix: Two-pass scoring in mapColumns

Replace the `mapColumns` function (lines 142-169) with a two-pass approach:

**Pass 1 - Exact matches only (highest priority):**
For each field, scan all headers. If the normalized header exactly equals an alias, map it and mark the column as used. "supplier name" exactly matches the alias "supplier name" in `COLUMN_ALIASES.supplier`, so col 3 wins immediately.

**Pass 2 - Best partial match (for unmapped fields):**
For fields still unmapped after Pass 1, scan all remaining headers. Instead of stopping at the first partial match, evaluate ALL candidates and pick the one with the **longest** matching alias. This prevents "Supplier Country" (partial match on "supplier", 8 chars) from winning over better matches.

Additionally, mark columns as "used" so two fields cannot map to the same column.

```text
function mapColumns(headers):
  normalizedHeaders = headers.map(normalizeHeader)
  usedColumns = Set()

  // Pass 1: Exact matches
  for each (field, aliases):
    for each header[i]:
      if not used AND aliases.includes(header[i]):
        map[field] = i
        usedColumns.add(i)
        break

  // Pass 2: Best partial match for unmapped fields
  for each (field, aliases):
    if already mapped, skip
    bestCol = -1, bestLen = 0
    for each header[i]:
      if not used:
        find longest alias that partial-matches
        if found.length > bestLen:
          bestCol = i, bestLen = found.length
    if bestCol >= 0:
      map[field] = bestCol
      usedColumns.add(bestCol)

  return map
```

## Expected result with manifest TCNU2673243 headers

| Field       | Before (wrong)           | After (correct)            |
|-------------|-------------------------|---------------------------|
| supplier    | Col 2: Supplier Country  | Col 3: Supplier Name      |
| description | Col 17: QTY Material     | Col 18: ZF Part Description |
| ncm         | Col 20: NCM Code         | Col 20: NCM Code (no change) |
| gross_weight| Col 8: Total Gross Weight | Col 8 (no change)         |
| hs_code     | Col 19: HS Code          | Col 19 (no change)        |
| packages_qty| Col 6: QTY Packages      | Col 6 (no change)         |
| packages_type| Col 7: Kind of Packaging | Col 7 (no change)         |
| invoice_ref | Col 11 or 13             | Col 11: Delivery Note (no change) |
| cnpj        | Col 24: VAT No.          | Col 24 (no change)        |

Why it works:
- "supplier name" is an exact alias for `supplier` -- maps in Pass 1
- "supplier country" has no exact alias match, so col 2 stays free
- "zf part description" contains "description" (11 chars) vs "qty material" contains "material" (8 chars) -- Pass 2 picks the longer match

## Files changed

1. `supabase/functions/sea-submit-analysis/xlsxExtractor.ts` -- rewrite `mapColumns` function (lines 142-169)

No other changes needed. NCM dual-pass logic stays as-is. Automatic edge function deploy after the change.
