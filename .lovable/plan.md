# Correcao: NCM — aceitar 4, 6 ou 8 digitos e ler de ambas as colunas

## Problema

O extrator XLSX so le NCM da coluna "NCM Code" (que tem 4 digitos) e ignora a coluna "HS Code" (que tem 6 ou 8 digitos). Todos os tamanhos (4, 6 e 8 digitos) da coluna  "NCM Code" sao validos e devem ser aceitos.

## Mudancas (2 arquivos)

### 1. `xlsxExtractor.ts`

**Linha 227 — filtro da funcao `extractNcmCodes`:**

```
Antes:  .filter(p => /^\d{4,10}$/.test(p))
Depois: .filter(p => /^\d{4}$/.test(p) || /^\d{6}$/.test(p) || /^\d{8}$/.test(p))
```

Aceita exatamente 4, 6 ou 8 digitos. Descarta 5, 7, 9, 10 digitos.

**Linha 359-360 — extrair de ambas as colunas ncm + hs_code:**

```
Antes:
  // Extract NCM codes (ONLY from NCM column, NEVER from HS column)
  const ncmCodes = colMap.ncm >= 0 ? extractNcmCodes(row[colMap.ncm]) : [];

Depois:
  // Extract NCM from both NCM and HS Code columns, accept 4/6/8 digits
  const ncmFromNcmCol = colMap.ncm >= 0 ? extractNcmCodes(row[colMap.ncm]) : [];
  const ncmFromHsCol = colMap.hs_code >= 0 ? extractNcmCodes(row[colMap.hs_code]) : [];
  const ncmCodes = [...new Set([...ncmFromNcmCol, ...ncmFromHsCol])];
```

### 2. `pdfExtractor.ts`

**Prompt (linha 107):** Aceitar 6 ou 8 digitos (PDF nao costuma ter 4 digitos uteis, mas se tiver sera aceito):

```
Antes:
  NCM codes MUST have EXACTLY 8 digits...
  ONLY include 8-digit codes in the ncm_codes arrays.

Depois:
  NCM codes can have 4, 6, or 8 digits (e.g., 8708, 848120, 84812090).
  ONLY include codes with exactly 4, 6, or 8 digits in the ncm_codes arrays.
```

**Filtros de validacao (linhas 285 e 295):**

```
Antes:  .filter((c: string) => /^\d{8}$/.test(c))
Depois: .filter((c: string) => /^\d{4}$/.test(c) || /^\d{6}$/.test(c) || /^\d{8}$/.test(c))
```

## Resumo

```
Arquivo              Mudanca
-------------------  --------------------------------------------------
xlsxExtractor.ts     1. extractNcmCodes: filtro 4/6/8 digitos (linha 227)
                     2. Ler de ncm + hs_code (linha 360)

pdfExtractor.ts      1. Prompt: aceitar 4/6/8 digitos (linha 107)
                     2. Filtros: regex 4/6/8 digitos (linhas 285, 295)
```

Deploy automatico do edge function apos as alteracoes.