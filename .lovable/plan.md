# Padronizar fluxo persistido para Excel e demais não-PDF

## Contexto

O fluxo único `Extrair → Gravar (t_chb_file_extractions.raw_ocr_text) → Analisar a partir do persistido` já está ativo para PDFs/imagens. Para Excel:

- `extractRawTextForPersistence` (linha 1948) já cobre `.xlsx/.xls` e grava o texto em `raw_ocr_text` — então o conteúdo já entra em `dbOcrByFilename` e no bloco `📚 OCR BRUTO PERSISTIDO` do prompt.
- **Mas** dentro de `callAnthropicAPI` (linha 1316) e `callGeminiAPI` (linha 1462), os arquivos Excel ainda são **re-extraídos ao vivo** com `extractExcelText(file.content, ...)` e enviados ao LLM em paralelo ao bloco persistido.
- Resultado: o LLM recebe duas versões do mesmo Excel (uma persistida, outra re-extraída na hora), violando a regra de fonte única de verdade. O mesmo problema existe para arquivos "texto" tratados no `else` (atob direto).

## Objetivo

Garantir que, dentro das chamadas LLM, **apenas o conteúdo persistido em `t_chb_file_extractions.raw_ocr_text`** seja usado para Excel e demais formatos não-PDF/não-imagem — espelhando o que já vale para PDFs no novo fluxo.

## Mudanças

Arquivo único: `supabase/functions/analyze-chb-documents/index.ts`

1. **Assinatura das funções LLM**: adicionar parâmetro opcional `persistedOcr?: Record<string,string>` em `callAnthropicAPI` (linha 1246) e `callGeminiAPI` (linha 1419).

2. **`callAnthropicAPI` — bloco Excel (1316–1337)**: substituir a re-extração ao vivo por:
   - Se `persistedOcr[file.name]` existe e tem conteúdo, empurrar apenas um stub: `[Arquivo Excel: ${file.name}] — conteúdo já fornecido no bloco "OCR BRUTO PERSISTIDO".`
   - Caso contrário (não deveria acontecer no fluxo novo), manter fallback atual com warning explícito de "persistência ausente".

3. **`callAnthropicAPI` — bloco "Text-based files" (1338–1352)**: mesma lógica — preferir `persistedOcr[file.name]`; só cair no `atob` se nada persistido.

4. **`callGeminiAPI` — espelhar passos 2 e 3** nos blocos análogos (1462–1483).

5. **Chamadores (linhas 2527 e 2538)**: passar `dbOcrByFilename` como terceiro argumento.
   - `callAnthropicAPI(prompt, files, dbOcrByFilename)`
   - `callGeminiAPI(prompt, files, dbOcrByFilename)`

6. **PDF/imagem**: deixar o caminho atual intocado nesta iteração (já existe re-OCR ao vivo no LLM call, mas o usuário pediu paridade focada em Excel; mexer em PDF aqui amplia o escopo). O bloco persistido continua sendo a fonte que o prompt instrui a usar.

## Fora de escopo

- UI, banco, prompts e qualquer função fora de `analyze-chb-documents/index.ts`.
- Refator do caminho PDF dentro das funções LLM.
- Mudanças em `extractRawTextForPersistence` (já cobre Excel corretamente).

## Validação

Rodar nova análise em item com Excel anexado e confirmar nos logs:
- `[BG][raw-ocr-save] <arquivo.xlsx> → status=OK`
- `[BG][pre-analysis] Read back N raw_ocr_text rows` incluindo o `.xlsx`
- Ausência de chamadas redundantes a `extractExcelText` dentro de `callAnthropicAPI`/`callGeminiAPI` (apenas stub no payload do LLM).
- Resultado da análise mantém divergências/conformidades coerentes com o conteúdo do Excel.
