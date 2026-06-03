## Objetivo

Mudar o fluxo do `analyze-chb-documents` para:

1. **Extrair** OCR bruto de TODOS os arquivos
2. **Gravar** cada extração em `dados_dachser.t_chb_file_extractions` (uma linha por arquivo)
3. **Analisar** lendo o `raw_ocr_text` direto da tabela (fonte única de verdade)

Hoje a análise roda primeiro e a persistência do OCR acontece DEPOIS (linha 2581-2583), o que causou o bug do item 122 (só um arquivo gravado, porque vinha de mapa em memória incompleto).

## Mudança cirúrgica

Arquivo único: `supabase/functions/analyze-chb-documents/index.ts`.

### 1. Mover `persistRawOcrForFiles` para ANTES do LLM

- Hoje é chamado em ~linha 2581, após o LLM responder.
- Mover para logo após a montagem de `extractedTexts` e ANTES da chamada ao Gemini (próximo da linha 2310, no bloco que monta `cachedContext`).
- Manter assinatura atual: ela já re-extrai OCR via `extractRawTextForPersistence` quando o mapa em memória vem vazio/curto (linha 1991-1994), garantindo que TODOS os arquivos fiquem gravados.

### 2. Reler o `raw_ocr_text` da tabela para alimentar a análise

- Após `persistRawOcrForFiles`, chamar `callMariaDBProxy('get_chb_extractions', { itemId, etapa: stepId })` (ou criar action equivalente se não existir — verificar no mariadb-proxy antes; se faltar, adicionar SELECT simples).
- Construir um mapa `dbOcrByFilename: Record<string, string>` a partir do retorno.
- Substituir o uso de `extractedTexts` no prompt do LLM por esse mapa lido do banco. Mantém `extractedTexts` como fallback se a leitura falhar.

### 3. Bloco "GROUND TRUTH" do prompt

- O bloco atual (linha 2316-2356) lista `structured_fields` por arquivo. Adicionar — logo abaixo — um bloco com o `raw_ocr_text` de cada arquivo (truncado a ~8k chars/arquivo para caber no contexto), também vindo da tabela.
- Texto introdutório: "OCR bruto persistido em `t_chb_file_extractions` — fonte única de verdade. Não invente valores fora deste texto."

### 4. Remover dupla persistência

- Remover a chamada de `persistRawOcrForFiles` em ~linha 2581 (passou a rodar antes).
- Manter `saveExtractedData` (loop linha 2615+) — é um cache separado de campos estruturados pós-análise, não conflita.

## Validação

1. Redeploy de `analyze-chb-documents`.
2. Nova análise no item 122/123.
3. Logs esperados, em ordem:
   - `[BG][raw-ocr-save] Persisting raw OCR for N file(s)`
   - N linhas `extractionId=… status=OK`
   - `[BG] Reading raw OCR back from t_chb_file_extractions… N rows`
   - `[BG] Analysis completed`
4. SQL: `SELECT filename, LENGTH(raw_ocr_text) FROM dados_dachser.t_chb_file_extractions WHERE item_id=123` → deve retornar 1 linha por arquivo enviado, todas com `raw_ocr_text` > 10 chars.

## Não-escopo

- Sem alteração de schema.
- Sem mudança em `mariadb-proxy` exceto, se necessário, adicionar `get_chb_extractions` (action SELECT simples) — confirmar antes de criar.
- Sem mudança no frontend.
- Sem refator do `extract-chb-file` (não está no fluxo principal do botão Analisar).
