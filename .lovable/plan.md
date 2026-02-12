
# Corrigir Extração de Seal Number no PDF Extractor

## Problema Real

O valor do seal no HBL e `200030614`, mas o extrator (Gemini/Claude) esta lendo como `2000030614` (o valor do manifest). Quando a comparacao acontece, ambos ja tem o mesmo valor, entao nunca detecta divergencia.

O problema esta na **etapa de extracao** (`pdfExtractor.ts`), nao na comparacao. O LLM esta "corrigindo" ou confundindo o seal number ao extrair do PDF.

## Causa Raiz

1. O prompt de extracao em `pdfExtractor.ts` (linha 75) define seal apenas como `"seal": "string"` sem instrucoes especificas sobre preservacao exata de digitos
2. O LLM (Gemini 3) pode estar "arredondando" ou "corrigindo" numeros visualmente similares durante a extracao
3. Nao ha validacao pos-extracao que verifique se o valor extraido corresponde fielmente ao texto original do PDF

## Solucao

### 1. Reforcar o prompt de extracao em `pdfExtractor.ts`

Adicionar instrucoes explicitas no `EXTRACTION_PROMPT` sobre seal numbers e campos numericos criticos:

```text
SEAL NUMBER EXTRACTION (CRITICAL - EXACT DIGITS):
- Extract the seal number EXACTLY as printed in the document
- DO NOT modify, correct, or "fix" any digits
- Every zero matters: "200030614" is DIFFERENT from "2000030614"
- Copy the exact sequence of characters - do not add or remove any digit
- If unclear, prefer the value closest to what is visually printed
```

Tambem adicionar na regra 2 (CRITICAL RULES):

```text
7. For seal numbers, container numbers, and reference numbers: 
   extract the EXACT character sequence as printed. 
   NEVER add, remove, or modify any digit — even zeros.
```

### 2. Adicionar instrucao no prompt de analise LLM (prompts.ts)

Reforcar nas secoes de extracao do manifest_hbl prompt que o seal deve ser extraido com fidelidade total, adicionando:

```text
SEAL NUMBER EXTRACTION (ABSOLUTE FIDELITY):
- Extract seal numbers CHARACTER BY CHARACTER as they appear
- Different quantities of zeros = DIFFERENT seal numbers
- "200030614" (9 digits) ≠ "2000030614" (10 digits)
- NEVER assume a seal should match another document's seal
- Extract INDEPENDENTLY from each document, then compare
```

### 3. Adicionar log de debug no `deterministicCompare.ts`

Na funcao `compareExact` usada para comparar seals, adicionar um log temporario para rastrear os valores exatos sendo comparados:

```typescript
console.log(`[CompareExact] ${label}: source="${sourceVal}" target="${targetVal}" status=${status}`);
```

Isso ajudara a confirmar se o problema e realmente na extracao ou se ha alguma normalizacao escondida.

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/sea-submit-analysis/pdfExtractor.ts` | Reforcar EXTRACTION_PROMPT com instrucoes de fidelidade exata para seal/container/reference numbers |
| `supabase/functions/sea-submit-analysis/prompts.ts` | Adicionar regra de extracao independente e fiel de seal numbers em cada prompt |
| `supabase/functions/sea-submit-analysis/deterministicCompare.ts` | Adicionar log de debug na funcao compareExact para rastrear valores |

## Impacto

- Corrige a raiz do problema: o LLM vai extrair o seal exatamente como aparece no PDF
- Afeta tanto o pipeline deterministico (extracao via pdfExtractor) quanto o pipeline LLM legado (prompts)
- Nao quebra nenhuma funcionalidade existente - apenas adiciona mais precisao na extracao
- O log de debug permite validar rapidamente se a correcao funcionou
