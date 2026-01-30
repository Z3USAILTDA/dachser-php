

# Correção: Eliminar Alucinação de NCMs pelo LLM

## Diagnóstico Confirmado

Após analisar os documentos PDF enviados:

| Documento | NCMs Reais (verificação visual) |
|-----------|--------------------------------|
| **HBL** | 8421, 8481, 8708, 8412, 4016, 8543, 8483, 7318, 9032, 8544, 7320, 8414, 7326, 3926 |
| **MBL** | 8421, 8481, 8708, 8412, 4016, 8543, 8483, 7318, 9032, 8544, 7320, 8414, 7326, 3926 |

**NCM 3917 NÃO EXISTE em nenhum dos documentos** - o LLM está inventando.

## Solução: Validação Pós-Análise

Adicionar uma camada de validação APÓS o LLM retornar a análise, que:
1. Extrai NCMs do texto OCR do MBL (fonte confiável)
2. Verifica se cada NCM reportado como "Missing" realmente existe no HBL
3. Remove falsos positivos (NCMs inventados)

**A lógica comparativa HBL × MBL permanece intacta** - apenas adicionamos uma verificação de sanidade no final.

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/sea-submit-analysis/index.ts` | Adicionar validação pós-LLM |
| `supabase/functions/sea-submit-analysis/prompts.ts` | Adicionar regras anti-alucinação no prompt |

## Implementação

### 1. Nova Função: `extractNcmsFromOcrText` (index.ts)

Extrai NCMs do texto OCR de forma confiável:

```typescript
function extractNcmsFromOcrText(ocrText: string): string[] {
  // Padrão 1: NCM-CODES: seguido de lista
  const ncmCodesBlockMatch = ocrText.match(/NCM[-\s]?CODES?[:\s]+([^\n]+(?:\n(?!\d{4}[A-Z])[^\n]+)*)/i);
  
  const allNcms: string[] = [];
  
  if (ncmCodesBlockMatch) {
    const block = ncmCodesBlockMatch[1];
    const codes = block.match(/\b(\d{4})(?:\d{4})?\b/g) || [];
    allNcms.push(...codes.map(c => c.substring(0, 4))); // Normaliza para 4 dígitos
  }
  
  // Padrão 2: Números de 4 dígitos que começam com 3, 4, 7, 8, 9
  const standaloneMatches = ocrText.match(/\b([3-9]\d{3})\b/g) || [];
  allNcms.push(...standaloneMatches);
  
  // Remover duplicatas
  return [...new Set(allNcms)].sort();
}
```

### 2. Nova Função: `validateAndCorrectNcmAnalysis` (index.ts)

Valida o resultado do LLM contra os NCMs do OCR:

```typescript
function validateAndCorrectNcmAnalysis(
  llmResult: string, 
  mblOcrText: string,
  hblOcrText?: string
): string {
  console.log(`🔍 [NCM Validation] Starting post-LLM validation...`);
  
  // Extrair NCMs do OCR do MBL
  const mblOcrNcms = extractNcmsFromOcrText(mblOcrText);
  console.log(`🔍 [NCM Validation] NCMs found in MBL OCR: ${mblOcrNcms.join(', ')}`);
  
  // Extrair NCMs do OCR do HBL (se disponível)
  const hblOcrNcms = hblOcrText ? extractNcmsFromOcrText(hblOcrText) : [];
  if (hblOcrNcms.length > 0) {
    console.log(`🔍 [NCM Validation] NCMs found in HBL OCR: ${hblOcrNcms.join(', ')}`);
  }
  
  // Encontrar a linha "Missing in MBL" no resultado
  const missingMatch = llmResult.match(/Missing in MBL:\s*([^\n]+)/i);
  if (!missingMatch) {
    console.log(`✅ [NCM Validation] No "Missing in MBL" line found - skipping validation`);
    return llmResult;
  }
  
  const reportedMissing = missingMatch[1]
    .split(/[,\s]+/)
    .map(n => n.trim())
    .filter(n => /^\d{4}$/.test(n));
  
  if (reportedMissing.length === 0 || missingMatch[1].toLowerCase().includes('none')) {
    console.log(`✅ [NCM Validation] No NCMs reported as missing - skipping validation`);
    return llmResult;
  }
  
  console.log(`🔍 [NCM Validation] LLM reported missing: ${reportedMissing.join(', ')}`);
  
  // Verificar cada NCM "faltando"
  const trulyMissing: string[] = [];
  const falsePositives: string[] = [];
  
  for (const ncm of reportedMissing) {
    // Se existe no MBL OCR, é um falso positivo
    if (mblOcrNcms.includes(ncm)) {
      falsePositives.push(ncm);
      continue;
    }
    
    // Se NÃO existe no HBL OCR, é alucinação (NCM inventado)
    if (hblOcrNcms.length > 0 && !hblOcrNcms.includes(ncm)) {
      falsePositives.push(ncm);
      console.log(`⚠️ [NCM Validation] NCM ${ncm} is HALLUCINATED - not found in either document`);
      continue;
    }
    
    // NCM realmente falta no MBL
    trulyMissing.push(ncm);
  }
  
  // Se encontramos falsos positivos, corrigir o resultado
  if (falsePositives.length > 0) {
    console.log(`⚠️ [NCM Validation] Removing ${falsePositives.length} false positives: ${falsePositives.join(', ')}`);
    
    const correctedMissing = trulyMissing.length > 0 ? trulyMissing.join(', ') : 'none';
    const correctedResult = llmResult.replace(
      /Missing in MBL:\s*[^\n]+/i,
      `Missing in MBL: ${correctedMissing}`
    );
    
    // Atualizar status se não há mais NCMs faltando
    if (trulyMissing.length === 0) {
      return correctedResult
        .replace(/NCM_STATUS:\s*UPDATE_REQUIRED/i, 'NCM_STATUS: MATCH')
        .replace(/Status:\s*UPDATE REQUIRED(\s*\n)/i, 'Status: MATCH$1');
    }
    
    return correctedResult;
  }
  
  console.log(`✅ [NCM Validation] All reported missing NCMs are valid`);
  return llmResult;
}
```

### 3. Aplicar Validação no Fluxo Principal (index.ts, após linha 751)

```typescript
// Após receber resultado do Claude
let resultText = data.content?.[0]?.text || '';

// VALIDAÇÃO PÓS-ANÁLISE: Verificar NCMs contra OCR
if (analysisType === 'hbl_mbl' && preExtractedMblTexts.length > 0) {
  const combinedMblOcr = preExtractedMblTexts.join('\n');
  resultText = validateAndCorrectNcmAnalysis(resultText, combinedMblOcr);
}
```

### 4. Adicionar OCR do HBL também (linhas 506-523)

Para detectar alucinações que não existem em nenhum documento:

```typescript
let preExtractedMblTexts: string[] = [];
let preExtractedHblTexts: string[] = [];  // NOVO

for (let i = 0; i < pdfFiles.length; i++) {
  const file = pdfFiles[i];
  
  if (file.file_type === 'mbl') {
    // ... código existente para MBL OCR ...
  }
  
  // NOVO: Também extrair NCMs do HBL para validação cruzada
  if (file.file_type === 'base' || file.file_type === 'hbl') {
    console.log(`🔍 [OCR] Also pre-extracting HBL for cross-validation: ${file.name}`);
    const ocrText = await extractTextViaVisionAPI(file.base64, file.name);
    if (ocrText && ocrText.length > 100) {
      preExtractedHblTexts.push(ocrText);
    }
  }
}
```

### 5. Regras Anti-Alucinação no Prompt (prompts.ts)

Adicionar após a linha 1743:

```typescript
★★★ ANTI-HALLUCINATION RULES FOR NCM ★★★

CRITICAL: You MUST extract NCM codes ONLY from what is VISUALLY PRESENT in the documents.

FORBIDDEN:
1. DO NOT invent NCM codes that are not explicitly written in the documents
2. DO NOT mistake invoice numbers, weights, or phone numbers for NCM codes
3. DO NOT guess NCM codes based on product descriptions
4. DO NOT report an NCM as "Missing in MBL" if you cannot clearly read it in the HBL

VERIFICATION BEFORE REPORTING "MISSING":
For EVERY NCM you list as "Missing in MBL", you MUST:
1. CONFIRM it appears in the HBL document (page number, location)
2. CONFIRM you checked ALL pages of the MBL (including continuation sheets)
3. Only report as missing if you are 100% certain it exists in HBL but not in MBL

If you are uncertain about an NCM code, DO NOT include it in your analysis.
```

## Fluxo Corrigido

```
┌─────────────────────────────────────────────────────────────────┐
│                        FLUXO DE ANÁLISE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. OCR HBL (Gemini) → Lista de NCMs                            │
│  2. OCR MBL (Gemini) → Lista de NCMs                            │
│                                                                 │
│  3. Claude Analisa HBL × MBL                                    │
│     └─> Compara documentos (LÓGICA NÃO ALTERADA)                │
│     └─> Reporta NCMs "faltando no MBL"                          │
│                                                                 │
│  4. NOVA VALIDAÇÃO PÓS-LLM                                      │
│     └─> Para cada NCM "faltando":                               │
│         - Existe no OCR do MBL? → Remover (falso positivo)      │
│         - Não existe no OCR do HBL? → Remover (alucinação)      │
│         - Caso contrário → Manter (real)                        │
│                                                                 │
│  5. Resultado Corrigido → Usuário                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Impacto

| Aspecto | Resultado |
|---------|-----------|
| Lógica comparativa HBL × MBL | Não alterada |
| NCM 3917 alucinado | Será removido automaticamente |
| Falsos positivos | Eliminados via validação cruzada |
| Tempo adicional | +3-5s (OCR do HBL) |

## Resultado Esperado

Após implementação, a análise do item 555 deve mostrar:

```
6) NCM CODES
- HBL NCMs: 3926, 4016, 7318, 7320, 7326, 8412, 8414, 8421, 8481, 8483, 8543, 8544, 8708, 9032
- MBL NCMs: 3926, 4016, 7318, 7320, 7326, 8412, 8414, 8421, 8481, 8483, 8543, 8544, 8708, 9032
- Missing in MBL: none
- Extra in MBL: none
- Status: MATCH
```

