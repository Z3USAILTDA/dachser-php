# Plan: corrigir Localização Automática para usar dados do banco

## Problema

A "localização automática" do ajuste do usuário sempre cai em **"Erro na localização automática"** com confiança **baixa** (como na imagem).

Causa: o `chb-corrections` ainda tenta `fetch(file.url)` em `t_dachser_chb_files` para ler o conteúdo do arquivo. Como os documentos são PDFs binários, o `fileResponse.text()` não retorna texto legível, então `locateValueInFile` e o re-extraction (Gemini Pro) recebem lixo ou nada — falham e gravam "Erro na localização automática / baixa confiança".

Com a nova arquitetura, a análise CHB já persiste o conteúdo trabalhável em `ai_agente.t_dachser_chb_extracted_data` (colunas `raw_text` + `extracted_fields` por `item_id` + `filename`). Essa é a fonte que a IA deve consultar para localizar o valor corrigido.

## Mudança proposta (cirúrgica, apenas no edge function)

Arquivo: `supabase/functions/chb-corrections/index.ts`

1. **Nova helper `fetchDocContentFromDb(client, item_id, filename)`**
   - Faz `SELECT raw_text, extracted_fields FROM ai_agente.t_dachser_chb_extracted_data WHERE item_id = ? AND filename = ? LIMIT 1`.
   - Fallback de matching: se nada bater por filename exato, tenta `LIKE` por tokens do filename (mesma normalização já usada hoje no bloco de file_url).
   - Fallback final: pega todos os registros do `item_id` e concatena `raw_text` (ou `extracted_fields` JSON.stringificado) ordenados por `updated_at DESC` — assim, mesmo se o `filename` enviado pelo frontend for um label divergente, o Gemini ainda recebe contexto útil.
   - Retorna a string composta: `${raw_text || ''}\n\n=== Campos já extraídos ===\n${extracted_fields}`.

2. **Action `save` (linhas ~589-690)**
   - Substituir todo o bloco que faz `JOIN t_dachser_chb_files` + `fetch(row.file_url)` pela chamada de `fetchDocContentFromDb`.
   - Manter `file_content` enviado pelo cliente como prioridade (se vier preenchido, usa direto).
   - Sem conteúdo do DB → segue o caminho atual de "Localização manual não realizada".

3. **Action `reprocess-pending` (linhas ~882-980)**
   - Mesma substituição: trocar o `JOIN t_dachser_chb_files` + `fetch(file_url)` por `fetchDocContentFromDb`.
   - Garante que correções antigas marcadas como `baixa` / "Erro" possam ser re-resolvidas pelo novo backend ao rodar reprocess.

4. **Sem mudanças** em `locateValueInFile` e `reextractFieldWithContext` — eles continuam recebendo `fileContent: string` e o prompt continua igual. Só muda a origem da string.

## Não-objetivos / o que NÃO muda

- Esquema do banco (nenhuma migration).
- Frontend (`EditableCell`, `useChbCorrections`, `ConferenciaChb`) — payload de `save` continua o mesmo; `file_content` continua opcional.
- `analyze-chb-documents` e o fluxo de gravação em `t_dachser_chb_extracted_data` (já existem, só passamos a consumir).
- Outros consumidores do `t_dachser_chb_files`/`t_dachser_chb_docs` — não tocamos nessas queries fora de `chb-corrections`.
- Lógica das regras de extração (`saveExtractionRule`) e do `applied_count`.

## Validação

1. Editar um campo de um documento já analisado (ex.: `$35,662.74` da imagem) → tooltip deve mostrar "Página/Seção …" e confiança **alta** ou **média**, não mais "Erro na localização automática / baixa".
2. Em casos onde `raw_text` está vazio, comportamento deve ser idêntico ao atual (fallback gracioso).
3. Rodar `reprocess-pending` em correções antigas e confirmar atualização de `location_reference`/`location_confidence` em `t_dachser_chb_user_corrections`.
