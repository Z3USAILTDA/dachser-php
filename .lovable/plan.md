
# Correção Final: Remover Referências "HS Code" Remanescentes no Código

## Problema Identificado

Ainda existem 2 instruções contraditórias que orientam o modelo LLM a extrair de colunas "HS Code" como fonte de NCM:

### Referências Problemáticas Encontradas

| Arquivo | Linha | Texto Problemático |
|---------|-------|-------------------|
| `sea-submit-analysis/index.ts` | 438 | `Include ALL columns that contain NCM or HS codes` |
| `sea-submit-analysis/prompts.ts` | 1199 | `Extract ALL values from "HS Code" or "NCM Code" columns` |

Estas instruções estão em conflito direto com as regras de exclusão de HS Code adicionadas anteriormente, causando comportamento inconsistente na extração de NCM.

---

## Arquivos a Modificar

1. **`supabase/functions/sea-submit-analysis/index.ts`**
2. **`supabase/functions/sea-submit-analysis/prompts.ts`**

---

## Mudanças Específicas

### 1. Corrigir Linha 438 (sea-submit-analysis/index.ts)

**Antes:**
```typescript
3. EXTRACTION RULES:
   - Include ALL columns that contain NCM or HS codes
```

**Depois:**
```typescript
3. EXTRACTION RULES:
   - Include ONLY columns that contain NCM codes ("NCM Code", "Código NCM")
   - NEVER include values from "HS Code" columns - HS and NCM are different systems
```

### 2. Corrigir Linha 1199 (sea-submit-analysis/prompts.ts)

**Antes:**
```text
EXTRACTION RULES FOR NCM CODES:
1. From MANIFEST: Extract ALL values from "HS Code" or "NCM Code" columns EXACTLY as they appear.
```

**Depois:**
```text
EXTRACTION RULES FOR NCM CODES:
1. From MANIFEST: Extract ONLY values from "NCM Code" or "Código NCM" columns.
   - NEVER extract from "HS Code" columns - HS and NCM are different classification systems
```

---

## Detalhes Técnicos

### Mudanças em `sea-submit-analysis/index.ts`

Localização: Linhas 437-441 (seção "3. EXTRACTION RULES")

**Bloco atual:**
```typescript
3. EXTRACTION RULES:
   - Include ALL columns that contain NCM or HS codes
   - Keep the EXACT values as they appear (4-digit: 8481, 8-digit: 84819090)
   - DO NOT truncate or modify code lengths
   - Extract codes of ANY length exactly as written
```

**Bloco corrigido:**
```typescript
3. EXTRACTION RULES:
   - Include ONLY columns that contain NCM codes ("NCM Code", "Código NCM")
   - NEVER include values from "HS Code" columns - HS and NCM are different classification systems
   - Keep the EXACT NCM values as they appear (4-digit: 8481, 8-digit: 84819090)
   - DO NOT truncate or modify code lengths
   - Extract NCM codes of ANY length exactly as written
```

### Mudanças em `sea-submit-analysis/prompts.ts`

Localização: Linhas 1198-1209 (seção "EXTRACTION RULES FOR NCM CODES")

**Bloco atual:**
```text
EXTRACTION RULES FOR NCM CODES:
1. From MANIFEST: Extract ALL values from "HS Code" or "NCM Code" columns EXACTLY as they appear.
2. From HBL: Extract ALL NCM values from NCM-CODES section and cargo descriptions EXACTLY as they appear.
```

**Bloco corrigido:**
```text
EXTRACTION RULES FOR NCM CODES:
1. From MANIFEST: Extract ONLY values from "NCM Code" or "Código NCM" columns.
   - NEVER extract from "HS Code" columns - HS and NCM are different classification systems
2. From HBL: Extract ALL NCM values from NCM-CODES section and cargo descriptions.
   - Look for labels: "NCM:", "NCM-CODES:", "NCM CODE:", "CODIGO NCM:"
   - IGNORE labels: "HS:", "HS-CODE:", "HS CODE:", "H.S.:" - these are HS codes, NOT NCMs
```

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Manifest tem coluna "HS Code" com "870850" | Modelo pode extrair e comparar como NCM | Modelo ignora esta coluna |
| HBL tem label "HS: 8708" | Modelo pode extrair como NCM | Modelo ignora esta label |
| NCM existe em ambos mas marcado como "Extra in MBL" | Falso positivo por confusão HS/NCM | Comparação correta apenas NCMs |

## Impacto na Interface

**Nenhum impacto visual** - Apenas a lógica interna de extração será corrigida. O formato do resultado que o usuário recebe permanece exatamente igual.

---

## Ordem de Implementação

1. Atualizar `sea-submit-analysis/index.ts` - linhas 437-441
2. Atualizar `sea-submit-analysis/prompts.ts` - linhas 1198-1209
3. Deploy das edge functions `sea-submit-analysis` e `maritimo-analyze`

---

## Verificação Pós-Implementação

Após a correção:
- Submeter uma análise HBL × MBL com documento que contenha labels "HS Code"
- Verificar que os valores de "HS Code" NÃO aparecem na lista de NCMs
- Confirmar que "Extra in MBL" só contém NCMs verdadeiramente extras
