
# Correção Final: Remover Referências "HS Code" Remanescentes nos Prompts

## Problema Identificado

Apesar das correções anteriores, ainda existem instruções contraditórias nos prompts que instruem o modelo a extrair NCM de colunas "HS Code":

### Referências Problemáticas (AINDA PRESENTES)

| Arquivo | Linha | Texto Problemático |
|---------|-------|-------------------|
| `maritimo-analyze/prompts.ts` | 954 | `Look for "NCM Code", "Código NCM", or "HS Code" columns` |
| `maritimo-analyze/prompts.ts` | 960 | `usually 4-digit HS codes like "8481"` |
| `sea-submit-analysis/prompts.ts` | 938 | `Look for "NCM Code", "Código NCM", or "HS Code" columns` |
| `sea-submit-analysis/prompts.ts` | 944 | `usually 4-digit HS codes like "8481"` |

Estas instruções estão na seção **"RULE 11: PRESERVE NCM LENGTH DURING EXTRACTION"** e contradizem diretamente as regras de exclusão de HS Code adicionadas anteriormente.

---

## Arquivos a Modificar

1. **`supabase/functions/maritimo-analyze/prompts.ts`**
2. **`supabase/functions/sea-submit-analysis/prompts.ts`**

---

## Mudanças Específicas

### 1. Corrigir Linha 954/938 - Remover "HS Code" como fonte

**Antes:**
```
WHEN EXTRACTING NCMs FROM MANIFEST XLSX:
- Look for "NCM Code", "Código NCM", or "HS Code" columns
```

**Depois:**
```
WHEN EXTRACTING NCMs FROM MANIFEST XLSX:
- Look for "NCM Code" or "Código NCM" columns ONLY
- NEVER extract from "HS Code" columns - HS Code and NCM are DIFFERENT classification systems
```

### 2. Corrigir Linha 960/944 - Remover menção a "HS codes"

**Antes:**
```
WHEN EXTRACTING NCMs FROM HBL PDF:
- Extract exactly what you see (usually 4-digit HS codes like "8481")
- DO NOT pad or extend to 8 digits
```

**Depois:**
```
WHEN EXTRACTING NCMs FROM HBL PDF:
- Extract exactly what you see from "NCM:" or "NCM-CODES:" labels
- NCM codes may be 4-digit (8481) or 8-digit (84812090) - preserve the exact length
- NEVER extract from "HS:", "HS Code:", "HS-CODE:" labels - those are HS Codes, NOT NCMs
- DO NOT pad or extend to 8 digits
```

---

## Detalhes Técnicos

### Mudanças em `maritimo-analyze/prompts.ts`

Localização: Linhas 952-961 (seção "RULE 11: PRESERVE NCM LENGTH DURING EXTRACTION")

Modificação completa da seção:
```text
★★★ RULE 11: PRESERVE NCM LENGTH DURING EXTRACTION - CRITICAL ★★★
WHEN EXTRACTING NCMs FROM MANIFEST XLSX:
- Look for "NCM Code" or "Código NCM" columns ONLY
- NEVER extract from "HS Code" columns - HS Code and NCM are DIFFERENT classification systems
- If the column contains 8-digit values like "84812090", extract ALL 8 DIGITS
- DO NOT truncate to 4 digits - preserve the FULL value
- "84812090" must be extracted as "84812090", NOT as "8481"

WHEN EXTRACTING NCMs FROM HBL PDF:
- Extract exactly what you see from "NCM:" or "NCM-CODES:" labels
- NCM codes may be 4-digit (8481) or 8-digit (84812090) - preserve the exact length
- NEVER extract from "HS:", "HS Code:", "HS-CODE:" labels - those are HS Codes, NOT NCMs
- DO NOT pad or extend to 8 digits
```

### Mudanças em `sea-submit-analysis/prompts.ts`

Localização: Linhas 936-945 (mesma seção "RULE 11")

Aplicar a mesma correção.

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Manifest tem coluna "HS Code" com "870850" | Modelo pode extrair e usar | Modelo ignora esta coluna |
| HBL tem label "HS: 8708" | Modelo pode extrair como NCM | Modelo ignora esta label |
| HBL tem label "NCM-CODES: 8708, 8481" | Modelo extrai corretamente | Modelo extrai corretamente |

## Impacto na Interface

**Nenhum impacto visual** - Apenas a lógica interna de extração será corrigida. O formato do resultado permanece exatamente igual.

---

## Ordem de Implementação

1. Atualizar `sea-submit-analysis/prompts.ts` - linhas 936-945
2. Atualizar `maritimo-analyze/prompts.ts` - linhas 952-961
3. Deploy das edge functions `sea-submit-analysis` e `maritimo-analyze`
