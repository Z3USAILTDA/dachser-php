# Corrigir ordem de execução do novo fluxo síncrono CHB

## Problema

O bloco "extrai → grava → relê da tabela → analisa" foi inserido **antes** da declaração de `extractedTexts` em `supabase/functions/analyze-chb-documents/index.ts`.

- Linha 2272: `persistRawOcrForFiles(itemId, stepId, files, extractedTexts || {})`
- Linha 2586: `let extractedTexts: Record<string, string> | undefined;`

Isso dispara TDZ (`Cannot access 'extractedTexts' before initialization`), o `try/catch` engole o erro, `dbOcrByFilename` fica vazio e a análise cai no fallback antigo (in-memory). Confirmado nos logs do request 145.

## Correção

1. **Remover** o bloco atual em `supabase/functions/analyze-chb-documents/index.ts` linhas 2261-2286 (comentário + bloco `let dbOcrByFilename` + try/catch).

2. **Declarar** apenas a variável vazia nessa posição, para manter escopo visível no prompt builder:
   ```ts
   let dbOcrByFilename: Record<string, string> = {};
   ```

3. **Reinserir o bloco completo logo após** o OCR rodar e `extractedTexts` estar populado (após a linha ~2605, onde `extractedTexts = result.extractedTexts` é atribuído pelo caminho de cache miss; e também garantir cobertura do caminho cache hit linha 2594). Local exato: imediatamente após o bloco `if (cachedExtraction)…else{…}` que define `extractedTexts`, e **antes** da chamada ao LLM/Anthropic.

   ```ts
   // NOVO FLUXO: grava raw OCR em t_chb_file_extractions e relê como fonte única
   if (itemId) {
     try {
       const persistResults = await persistRawOcrForFiles(itemId, stepId, files, extractedTexts || {});
       console.log(`[BG][pre-analysis] Persisted raw OCR for ${persistResults.length} file(s)`);
       const dbRowsResp = await callMariaDBProxy('get_chb_extractions', { itemId, etapa: String(stepId) });
       const dbRows = dbRowsResp?.data || [];
       for (const row of dbRows) {
         if (row.filename && row.raw_ocr_text) dbOcrByFilename[row.filename] = row.raw_ocr_text;
       }
       console.log(`[BG][pre-analysis] Read back ${Object.keys(dbOcrByFilename).length} raw_ocr_text rows`);
     } catch (e) {
       console.error('[BG][pre-analysis] failed:', (e as Error).message);
     }
   }
   ```

4. **Manter** o bloco do prompt (linhas ~2386+) que injeta `📚 OCR BRUTO PERSISTIDO` quando `dbOcrByFilename` tiver itens — já está correto, só estava recebendo objeto vazio.

5. **Redeployar** `analyze-chb-documents` e rodar nova análise no item 123. Verificar logs:
   - `[BG][raw-ocr-save] v2-all-files :: Persisting raw OCR…`
   - `[BG][raw-ocr-save] <file> → extractionId=… status=OK`
   - `[BG][pre-analysis] Read back N raw_ocr_text rows`
   - SQL: `SELECT filename, LENGTH(raw_ocr_text) FROM dados_dachser.t_chb_file_extractions WHERE item_id=123 AND etapa='1'` → 1 linha por arquivo, todas com `raw_ocr_text > 0`.

## Escopo

Mudança cirúrgica em 1 arquivo (`analyze-chb-documents/index.ts`). Sem alteração de schema, sem mudança de UI, sem mexer no `mariadb-proxy`.
