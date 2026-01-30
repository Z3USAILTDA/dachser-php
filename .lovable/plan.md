
# Correção: Forçar OCR para TODOS os MBLs na Análise HBL×MBL

## Problema Encontrado

Após análise dos logs, identifiquei que:
1. O `file_type` está correto: `MBL TEMU7763442 16449915_HBG2086288.pdf -> mbl`
2. A função `isPdfLikelyScanned` deveria retornar `true` porque o nome contém "mbl"
3. **Porém não há nenhum log de OCR**, indicando que a função não foi deployada corretamente anteriormente

A função `sea-submit-analysis` foi **redeployada agora**. 

## Solução Adicional: Forçar OCR para Todos os MBLs

Para garantir que a extração de NCM funcione consistentemente, vou modificar a lógica para **sempre** executar OCR em arquivos MBL quando o tipo de análise for `hbl_mbl`, removendo a dependência da heurística `isPdfLikelyScanned`:

| Abordagem Atual | Nova Abordagem |
|-----------------|----------------|
| OCR se `isPdfLikelyScanned(file.name)` retorna `true` | OCR **sempre** para MBLs em análise `hbl_mbl` |
| Depende do nome do arquivo | Independente do nome |
| Pode falhar se nome não contém patterns | Garantido para todos os MBLs |

## Arquivo a Modificar

`supabase/functions/sea-submit-analysis/index.ts`

### Alteração (linhas 509-521)

**Antes:**
```typescript
if (file.file_type === 'mbl') {
  const shouldTryOcr = isPdfLikelyScanned(file.name);
  
  if (shouldTryOcr) {
    console.log(`🔍 [OCR] Pre-extracting text from MBL: ${file.name}`);
    const ocrText = await extractTextViaVisionAPI(file.base64, file.name);
    // ...
  }
}
```

**Depois:**
```typescript
if (file.file_type === 'mbl') {
  // ALWAYS run OCR for MBL files in HBL×MBL analysis
  // MBL documents are frequently image-based and Claude struggles with NCM extraction
  console.log(`🔍 [OCR] ALWAYS pre-extracting text from MBL for better NCM extraction: ${file.name}`);
  const ocrText = await extractTextViaVisionAPI(file.base64, file.name);
  
  if (ocrText && ocrText.length > 100) {
    preExtractedMblTexts.push(ocrText);
    console.log(`✅ [OCR] Successfully extracted ${ocrText.length} chars from MBL`);
  }
}
```

## Impacto

| Aspecto | Resultado |
|---------|-----------|
| Tempo de processamento | +3-5s para cada MBL (OCR via Gemini) |
| Confiabilidade | Muito maior - NCM codes serão extraídos consistentemente |
| Custo | Mínimo aumento (uma chamada Gemini Flash por MBL) |
| Benefício | Elimina falsos positivos de "NCM faltando no MBL" |

## Próximos Passos

1. Aplicar a alteração
2. Redeployar a função
3. Re-executar análise do item 555
4. Verificar nos logs se o OCR está sendo executado e se NCM 8544 é extraído
