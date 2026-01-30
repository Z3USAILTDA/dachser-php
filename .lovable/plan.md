
# Correção da Extração de NCM do MBL - PDF Baseado em Imagem

## Problema Identificado

A análise HBL × MBL está extraindo corretamente o NCM 8544 do HBL, mas **não está conseguindo extrair do MBL**. O log mostra:

> "NCM Code 8544 appears in HBL but is missing in MBL - MBL requires update to include this NCM code"

O usuário confirma que o NCM 8544 **existe** no MBL, indicando uma **falha de extração de texto do PDF**.

### Causa Raiz

Documentos MBL de armadores como CMA CGM frequentemente são **PDFs escaneados/baseados em imagem**, onde:
- O PDF não contém texto selecionável
- A camada de texto está vazia ou corrompida
- O conteúdo só pode ser lido via OCR (reconhecimento óptico de caracteres)

Atualmente, o sistema envia o PDF diretamente para o Claude/Gemini como documento, mas esses modelos podem ter dificuldade em extrair texto de PDFs baseados em imagem.

## Solução Proposta

Implementar um processo de extração em duas etapas para documentos PDF:

```text
┌─────────────────────────────────────────────────────────────────┐
│                     FLUXO DE EXTRAÇÃO PDF                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. TENTAR EXTRAÇÃO NATIVA DO PDF                               │
│     └─> Usar biblioteca pdf-parse para extrair texto            │
│                                                                 │
│  2. VERIFICAR QUALIDADE DA EXTRAÇÃO                             │
│     └─> Se texto extraído < 100 caracteres = PDF baseado em img │
│                                                                 │
│  3. FALLBACK PARA VISION API                                    │
│     └─> Converter PDF para imagem + enviar para Gemini Vision   │
│     └─> OU usar Claude's native PDF com flag para OCR           │
│                                                                 │
│  4. INCLUIR TEXTO PRÉ-EXTRAÍDO NO PROMPT                        │
│     └─> Anexar texto OCR como contexto adicional para o modelo  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/sea-submit-analysis/index.ts` | Adicionar função de pré-extração de texto PDF |

## Detalhes Técnicos

### 1. Nova Função: `extractPdfTextProgrammatically`

Adicionar função para tentar extrair texto do PDF antes de enviar ao LLM:

```typescript
async function extractPdfTextProgrammatically(pdfBase64: string): Promise<{ text: string; isScanned: boolean }> {
  try {
    // Usar biblioteca pdf-parse para extrair texto
    const pdfParse = await import('https://esm.sh/pdf-parse@1.1.1');
    const pdfBuffer = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    const data = await pdfParse.default(pdfBuffer);
    
    const cleanText = data.text.replace(/\s+/g, ' ').trim();
    const isScanned = cleanText.length < 100;
    
    console.log(`📄 PDF text extraction: ${cleanText.length} chars, isScanned: ${isScanned}`);
    
    return { text: cleanText, isScanned };
  } catch (e) {
    console.warn('PDF text extraction failed:', e);
    return { text: '', isScanned: true };
  }
}
```

### 2. Nova Função: `extractTextViaVisionAPI`

Para PDFs escaneados, usar Gemini Vision para OCR:

```typescript
async function extractTextViaVisionAPI(pdfBase64: string, fileName: string): Promise<string> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) return '';
  
  console.log(`🔍 [OCR] Extracting text from scanned PDF: ${fileName}`);
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: `Extract ALL text from this PDF document. Include EVERY piece of text you can see, especially:
- NCM codes (labeled as "NCM:", "NCM-CODES:", or similar)
- HS codes (for reference only)
- Weight values
- Container numbers
- All cargo descriptions
Output the raw text content, preserving structure.` },
            { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } }
          ]
        }],
        generationConfig: { maxOutputTokens: 8000 }
      })
    }
  );
  
  if (!response.ok) {
    console.error(`[OCR] Vision API failed: ${response.status}`);
    return '';
  }
  
  const data = await response.json();
  const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  console.log(`🔍 [OCR] Extracted ${extractedText.length} chars from ${fileName}`);
  
  return extractedText;
}
```

### 3. Modificar `analyzeWithAnthropic` (linhas ~378-406)

Adicionar pré-extração de texto para PDFs potencialmente escaneados:

```typescript
// Antes de adicionar PDFs como documentos, tentar extrair texto
let preExtractedMblText = '';

for (let i = 0; i < pdfFiles.length; i++) {
  const file = pdfFiles[i];
  
  // Para MBLs, tentar pré-extração de texto
  if (file.file_type === 'mbl') {
    const { text, isScanned } = await extractPdfTextProgrammatically(file.base64);
    
    if (isScanned) {
      console.log(`⚠️ MBL appears to be scanned, using Vision API for OCR`);
      preExtractedMblText = await extractTextViaVisionAPI(file.base64, file.name);
    } else {
      preExtractedMblText = text;
    }
    
    if (preExtractedMblText.length > 100) {
      contentParts.push({ 
        type: 'text', 
        text: `\n\n=== PRE-EXTRACTED MBL TEXT (OCR) FOR REFERENCE ===\n${preExtractedMblText}\n=== END OF MBL TEXT ===\n\nIMPORTANT: If you cannot extract NCM codes directly from the MBL PDF, use the pre-extracted text above.`
      });
    }
  }
  
  // Continuar com a lógica existente de adicionar o PDF
  contentParts.push({ 
    type: 'document', 
    source: { type: 'base64', media_type: 'application/pdf', data: file.base64 } 
  });
  // ...
}
```

### 4. Adicionar Instrução Explícita no Prompt HBL×MBL

Adicionar no `PROMPT_HBL_MBL` (prompts.ts, linha ~1720):

```typescript
// Adicionar após a seção de NCM codes
★★★ IMPORTANT: HANDLING SCANNED/IMAGE-BASED PDFs ★★★

If the MBL document appears to be scanned (image-based PDF with no selectable text):
1. Look for any PRE-EXTRACTED TEXT provided in the prompt context
2. Search this pre-extracted text for NCM codes matching the pattern "NCM:" or "NCM-CODES:"
3. If pre-extracted text is available, use it as the authoritative source for MBL NCM extraction
4. NEVER report "NCM not found in MBL" if the pre-extracted text contains NCM codes

The MBL from carriers like CMA CGM are frequently image-based and require OCR pre-processing.
```

## Impacto

| Cenário | Antes | Depois |
|---------|-------|--------|
| MBL com texto selecionável | ✅ Funciona | ✅ Funciona |
| MBL escaneado/imagem | ❌ NCMs não extraídos | ✅ OCR via Vision API |
| MBL parcialmente escaneado | ⚠️ Extração incompleta | ✅ Fallback automático |

## Estimativa de Tempo de Processamento

O OCR via Vision API adiciona ~3-5 segundos ao tempo de análise para MBLs escaneados.

## Testes Recomendados

1. Re-executar a análise do item 555 após a implementação
2. Verificar se o NCM 8544 é corretamente extraído do MBL
3. Testar com outros MBLs de armadores conhecidos por usar PDFs escaneados (CMA CGM, MSC, etc.)

## Alternativa: Forçar Claude a Re-analisar

Como alternativa mais simples, podemos apenas adicionar uma instrução mais forte no prompt para forçar o Claude a tentar mais vezes extrair o texto do PDF. No entanto, isso é menos confiável que o OCR pré-processado.
