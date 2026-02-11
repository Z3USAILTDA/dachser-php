

## Fix: XLSX Extraction Crash in `sea-submit-analysis`

### Problem

The Manifest/Pack List analysis is failing because the XLSX text extraction function crashes with a `TypeError: Assignment to constant variable` error. This means the manifest data (0 chars) is never sent to the AI model -- it only receives the HBL PDF, and correctly reports that no Manifest was provided.

### Root Cause

In `supabase/functions/sea-submit-analysis/index.ts`, the `extractXlsxText` function has two lines that attempt to nullify `const` variables for "memory optimization":

- **Line 458**: `arrayBuffer = null;` -- but `arrayBuffer` is declared with `const` on line 433
- **Line 508**: `lines = null;` -- but `lines` is declared with `const` on line 500

These cause a runtime crash, the function catches the error, returns an empty string, and the AI model never sees the manifest content.

### Fix

Two small changes in `supabase/functions/sea-submit-analysis/index.ts`:

1. **Line 433**: Change `const arrayBuffer` to `let arrayBuffer` so line 458's null assignment works
2. **Line 500**: Change `const` declaration of `lines` to `let` so line 508's null assignment works

### Technical Details

```text
Line 433:  const arrayBuffer = await response.arrayBuffer();
           ^^^^^ change to "let"

Line 500:  const lines = csv.split('\n')...
           ^^^^^ change to "let" (inside the for loop, so it's per-sheet)
```

Both changes are single-word fixes (`const` to `let`) that allow the existing memory optimization code to work as intended.

### Impact

- Manifest XLSX files will be properly extracted and sent to Claude for analysis
- All `manifest_hbl` analyses will receive both the Manifest data and HBL PDF
- No more "CRITICAL NOTICE: MANIFEST FILE NOT PROVIDED" false errors

