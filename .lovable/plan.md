
# Fix: XLSX Extractor Not Recognizing Column Headers

## Problem Identified

The structured pipeline's `xlsxExtractor.ts` found **0 exporters from 171 rows** because no column headers matched the predefined aliases. The logs show:

```
supplier col: -1, weight col: -1, ncm col: -1
```

Since `supplier col: -1`, the code skips ALL rows (line 249: `if (!supplierName) continue`). The analysis then produces incorrect results showing "Manifest: 0 kg" vs "HBL: 16107 kg".

## Root Cause

The ZF Automotive manifest uses headers that don't match any aliases in `COLUMN_ALIASES`. These manifests likely use German or custom header names (e.g., "Lieferant" instead of "Supplier", "Bruttogewicht" instead of "Gross Weight").

## Fix Plan

### 1. Add Debug Logging for Headers (xlsxExtractor.ts)

Add a console.log that prints the actual raw headers found in the XLSX, so we can see exactly what column names the file uses. This is critical for diagnosing future mismatches.

### 2. Expand Column Aliases (xlsxExtractor.ts)

Add German and additional international aliases commonly used in ZF/Dachser manifests:

| Field | New Aliases to Add |
|-------|-------------------|
| supplier | lieferant, lieferantenname, absender, sender, vendor, vendor name, hersteller, manufacturer |
| gross_weight | bruttogewicht, brutto, brutto gewicht, brutto kg, total weight, weight kg, gesamtgewicht |
| net_weight | nettogewicht, netto, netto gewicht, netto kg |
| cbm | volumen, volume, kubikmeter, m3, cubic meter |
| ncm | ncm nr, tariff code, tariff, taric, warentarifnummer, zolltarif |
| packages_qty | anzahl, stueck, stuck, pcs, colli, collis, no of packages, number of packages, package qty |
| packages_type | verpackungsart, art der verpackung, pack type |
| invoice_ref | lieferschein, rechnung, bestellnummer, order, order no, order number, po, po number, auftrags nr |
| description | bezeichnung, beschreibung, waren, warenbezeichnung, article, artikelbeschreibung, material |
| container | container nr, container id, behälter, behaelter |
| seal | plombe, siegelnummer, plombennummer, seal nr |
| cnpj | steuernummer, ust id, vat, vat number |

### 3. Fallback When No Supplier Column Found (xlsxExtractor.ts)

When `supplier col === -1`, instead of skipping all rows:

1. **Try to use "description" column as a grouping key** (common in some manifests where goods description acts as the identifier)
2. **If no grouping column at all**: aggregate ALL rows into a single exporter named from the consignee/file name, still extracting weight, CBM, NCM, and packages from whatever columns ARE mapped
3. **Remove the hard `if (!supplierName) continue`** check -- instead, use a fallback supplier name like "UNKNOWN EXPORTER" so data is still captured

### 4. Fallback to LLM for Unrecognized XLSX (index.ts)

In `analyzeWithStructuredPipeline()`, after XLSX extraction:

- If `manifestData.exporters.length === 0` AND `manifestData.total_rows > 0`, it means headers were not recognized
- In this case, fall back to LLM-based XLSX extraction: send the XLSX content as text (using the legacy `extractXlsxText()` CSV approach) to Claude/Gemini with a focused extraction prompt
- This is a safety net for unusual file formats

### 5. Validation Gate (index.ts)

Before using the structured pipeline result, add a validation check:
- If manifest has 0 exporters AND total rows > 5, log a warning and fall through to legacy LLM pipeline instead of producing a bogus comparison

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/sea-submit-analysis/xlsxExtractor.ts` | Add header logging, expand aliases, add fallback for missing supplier column |
| `supabase/functions/sea-submit-analysis/index.ts` | Add validation gate in structured pipeline when 0 exporters found from non-empty file |

## Implementation Order

1. Update `xlsxExtractor.ts` with expanded aliases + fallback logic
2. Update `index.ts` pipeline to detect and handle 0-exporter edge case
3. Deploy and test with the same ZF Automotive manifest file
