

# Correcao: NCM extraido com 4 digitos no PDF (HBL)

## Problema

O prompt do `pdfExtractor.ts` diz "Preserve exact digit count (4-digit: '8481', 8-digit: '84812090')" -- isso PERMITE que o LLM retorne HS codes de 4 digitos. E o filtro de validacao aceita `/\d{4,10}/`.

Resultado: HBL NCMs = [8708, 8481, 9032, ...] quando deveriam ser [87084090, 84812090, 90328929, ...]

O Manifest XLSX ja extrai corretamente com 8 digitos. Somente o PDF precisa de correcao.

## Solucao (somente `pdfExtractor.ts`, sem mexer em nada mais)

### Mudanca 1: Atualizar o prompt (linha 107)

```text
Antes:
  "Preserve exact digit count (4-digit: '8481', 8-digit: '84812090')"

Depois:
  "NCM codes MUST have EXACTLY 8 digits (e.g., 84812090, 87084090).
   If the document shows 4-digit HS codes, you MUST expand them to their
   full 8-digit NCM equivalent if possible, or exclude them.
   ONLY include 8-digit codes in the ncm_codes arrays."
```

### Mudanca 2: Filtro de validacao (linhas 285 e 295)

```text
Antes:
  .filter((c: string) => /^\d{4,10}$/.test(c))

Depois:
  .filter((c: string) => /^\d{8}$/.test(c))
```

Isso garante que mesmo que o LLM retorne codes de 4 digitos, eles serao descartados na validacao.

## Arquivo unico alterado

```text
Arquivo                                           Mudanca
------------------------------------------------  -------------------------------------------
supabase/functions/sea-submit-analysis/           1. Prompt: exigir NCMs de 8 digitos
  pdfExtractor.ts                                 2. Validacao: filtro \d{8} (linhas 285, 295)
```

Nenhum outro arquivo sera tocado. Deploy automatico do edge function apos a alteracao.
