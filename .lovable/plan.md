
# Correção do Problema NCM vs HS Code no Cenário HBL x MBL

## Problema Identificado

No cenário **HBL x MBL**, o prompt `PROMPT_HBL_MBL` ainda contém múltiplas referências que instruem o modelo a buscar/extrair de labels "HS Code", causando confusão na comparação de NCMs.

### Referências Problemáticas Encontradas

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `sea-submit-analysis/prompts.ts` | 1441 | Instrui buscar "HS-CODE:", "HS CODE:" para NCM |
| `sea-submit-analysis/prompts.ts` | 1565 | Lista "HS-CODE", "HS CODE", "HSCODE", "H.S." como keywords para NCM |
| `maritimo-analyze/prompts.ts` | 954 | Instrui buscar "HS Code" como fonte de NCM |
| `maritimo-analyze/prompts.ts` | 1788 | Instrui usar keywords HS para extração de NCM |

---

## Arquivos a Modificar

1. **`supabase/functions/sea-submit-analysis/prompts.ts`**
2. **`supabase/functions/maritimo-analyze/prompts.ts`**

---

## Mudanças Específicas

### 1. Linha 1441 (sea-submit-analysis) - Seção "NCM LIST EXTRACTION"

**Antes:**
```
1. SCAN ALL PAGES: Look for "NCM-CODES:", "NCM CODES:", "HS-CODE:", "HS CODE:" labels
```

**Depois:**
```
1. SCAN ALL PAGES: Look for "NCM-CODES:", "NCM CODES:", "NCM CODE:", "NCM:" labels
   - NEVER extract from "HS-CODE:", "HS CODE:", "HS:", "H.S.:" labels - those are HS Codes, NOT NCMs
```

### 2. Linha 1565 (sea-submit-analysis) - Seção "KEYWORD VARIATIONS"

**Antes:**
```
HS/NCM: "HS-CODE", "HS CODE", "HSCODE", "NCM", "H.S."
```

**Depois:**
```
NCM: "NCM-CODES", "NCM CODES", "NCM CODE", "NCM:", "CODIGO NCM" (NEVER "HS-CODE", "HS CODE", "HSCODE", "H.S.")
```

### 3. Linha 954 (maritimo-analyze) - PROMPT_MANIFEST_HBL

**Antes:**
```
WHEN EXTRACTING NCMs FROM MANIFEST XLSX:
- Look for "NCM Code", "Código NCM", or "HS Code" columns
```

**Depois:**
```
WHEN EXTRACTING NCMs FROM MANIFEST XLSX:
- Look for "NCM Code", "Código NCM" columns ONLY
- NEVER extract from "HS Code" columns - HS and NCM are different systems
```

### 4. Linha 1788 (maritimo-analyze) - PROMPT_INVOICES_HBL

**Antes:**
```
- Extract NCM codes using ±60 character context window around keywords (NCM, HS, HS CODE, HSCODE, H.S., TARIC).
```

**Depois:**
```
- Extract NCM codes using ±60 character context window around keywords (NCM, NCM CODE, NCM-CODES, CODIGO NCM).
- NEVER extract from HS keywords (HS, HS CODE, HSCODE, H.S., TARIC) - those are different classification systems.
```

---

## Mudanças Adicionais no PROMPT_HBL_MBL

Adicionar no início do prompt HBL_MBL uma seção explícita similar à que já existe no PROMPT_MANIFEST_HBL:

```
████████████████████████████████████████████████████████████████████████████████
█ NCM CODES ONLY - DO NOT INCLUDE HS CODES                                       █
████████████████████████████████████████████████████████████████████████████████

★★★ CRITICAL DISTINCTION FOR HBL × MBL - READ BEFORE EXTRACTING ★★★

NCM (Nomenclatura Comum do Mercosul) ≠ HS Code (Harmonized System)
- NCM: Brazilian 8-digit tariff code (e.g., 84812090, 73182900)
- HS Code: International 4-6 digit code (e.g., 8481, 870850)
- THESE ARE DIFFERENT CLASSIFICATION SYSTEMS - DO NOT MIX THEM

FOR HBL AND MBL PDFs:
1. Extract ONLY values labeled "NCM:", "NCM-CODES:", "NCM CODE:"
2. NEVER extract from labels "HS:", "HS Code:", "HS-CODE:", "H.S.:"
3. If a document has BOTH labels, use ONLY the NCM-labeled values
4. A 4-6 digit code next to "HS" label is an HS Code, NOT an NCM - IGNORE IT

★★★ CONCRETE REJECTION EXAMPLES ★★★

REJECT (these are HS Codes, NOT NCMs):
- Label "HS Code:" with value "870850" → REJECT
- Label "HS-CODE:" with value "8708" → REJECT
- Label "H.S.:" with value "8481" → REJECT

ACCEPT (these are NCMs):
- Label "NCM-CODES:" with values "8708, 8481, 8421" → ACCEPT ALL
- Label "NCM:" with value "84812090" → ACCEPT
- Label "NCM CODE:" with value "73182900" → ACCEPT
```

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| MBL tem label "HS-CODE: 870850" | Modelo extrai e inclui na lista NCM | Modelo ignora esta label |
| MBL tem label "NCM-CODES: 8708, 8481" | Modelo pode misturar com HS | Modelo extrai corretamente |
| HBL tem ambos "HS: 8708" e "NCM: 87089900" | Modelo pode usar HS incorretamente | Modelo usa APENAS NCM |

## Impacto na Interface

**Nenhum impacto visual** - Apenas a lógica interna de extração e comparação será corrigida. A estrutura do resultado que o usuário recebe permanece exatamente igual.

---

## Ordem de Implementação

1. Atualizar `sea-submit-analysis/prompts.ts` - PROMPT_HBL_MBL (linhas 1441 e 1565)
2. Atualizar `maritimo-analyze/prompts.ts` - PROMPT_MANIFEST_HBL (linha 954)
3. Atualizar `maritimo-analyze/prompts.ts` - PROMPT_INVOICES_HBL (linha 1788)
4. Adicionar seção NCM vs HS Code no PROMPT_HBL_MBL de ambos arquivos
5. Deploy das edge functions

