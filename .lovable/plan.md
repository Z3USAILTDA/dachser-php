

# Correcao: xlsxExtractor.ts — ler NCM apenas da coluna NCM

## Problema

A ultima alteracao fez o extrator ler NCM de ambas as colunas (ncm + hs_code). O correto e ler APENAS da coluna NCM.

## Mudanca (1 arquivo, 1 local)

### Arquivo: `supabase/functions/sea-submit-analysis/xlsxExtractor.ts`

**Linhas 359-362 — reverter para ler apenas da coluna ncm:**

```
Antes (atual):
  const ncmFromNcmCol = colMap.ncm >= 0 ? extractNcmCodes(row[colMap.ncm]) : [];
  const ncmFromHsCol = colMap.hs_code >= 0 ? extractNcmCodes(row[colMap.hs_code]) : [];
  const ncmCodes = [...new Set([...ncmFromNcmCol, ...ncmFromHsCol])];

Depois:
  // Extract NCM codes ONLY from NCM column, accept 4/6/8 digits
  const ncmCodes = colMap.ncm >= 0 ? extractNcmCodes(row[colMap.ncm]) : [];
```

O filtro de 4/6/8 digitos na funcao `extractNcmCodes` (linha 227) permanece inalterado.

Deploy automatico do edge function apos a alteracao.

