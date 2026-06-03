## Diagnóstico

Logs do item 121:
```
[BG][raw-ocr-save] v2-all-files :: Persisting raw OCR for 4 file(s) (item 121)...
[BG][raw-ocr-save] No DB file match for "DOCS FINAL OERLIKON - JUNDIAI ( 159 Invoice 1.pdf" — known: (none)
ERROR mariadb-proxy: Column 'file_id' cannot be null
```

Causa raiz: `persistRawOcrForFiles` chama `get_chb_files(itemId=121)` → retorna `[]` (nenhuma linha em `t_dachser_chb_docs` com `is_active=1`). Como não há match, `dbFile?.id ?? null` é enviado ao `insert_chb_extraction`. A coluna `dados_dachser.t_chb_file_extractions.file_id` é `NOT NULL`, então o insert quebra para os 4 arquivos.

Os arquivos vêm no payload da requisição (upload direto na análise), mas não estão registrados em `t_dachser_chb_files` / `t_dachser_chb_docs`. Por isso o lookup falha.

## Plano (cirúrgico)

Editar apenas `supabase/functions/analyze-chb-documents/index.ts`, função `persistRawOcrForFiles`:

1. Manter o lookup atual em `get_chb_files`.
2. Quando não houver match para um arquivo (`dbFile` indefinido), chamar `create_chb_file` no `mariadb-proxy` para registrar o arquivo on-the-fly:
   - `itemId`, `filename: file.name`, `etapa: String(stepId)`, `docRole: file.docRole ?? 'O'`, `mime: file.mimeType ?? null`, `sizeBytes`, `userId: null`.
   - Isso insere em `t_dachser_chb_files` + `t_dachser_chb_docs` e retorna `fileId`.
3. Usar esse `fileId` recém-criado no `insert_chb_extraction`. Assim a constraint `NOT NULL` é satisfeita e o vínculo file↔item fica consistente.
4. Logar `[BG][raw-ocr-save] auto-registered fileId=… for "<name>"` para rastreabilidade.
5. Se o `create_chb_file` falhar, propagar o erro (manter a regra "OCR bruto não foi gravado para todos os arquivos").

Sem alterações no `mariadb-proxy`, sem migração de schema, sem mudanças no frontend.

## Validação

- Redeploy `analyze-chb-documents`.
- Pedir nova análise no item 122 (novo).
- Logs esperados:
  - `auto-registered fileId=…` para cada arquivo novo;
  - `extractionId=N status=OK (X chars)` para os 4 arquivos;
  - `SELECT COUNT(*) FROM dados_dachser.t_chb_file_extractions WHERE item_id=122` = 4.
