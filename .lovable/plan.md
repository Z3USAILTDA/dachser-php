## Diagnóstico

Novo erro do item 122:
```
mariadb-proxy error: Column 'url' cannot be null
```

Causa: `create_chb_file` no `mariadb-proxy` (linha 6232-6236) faz `INSERT INTO t_dachser_chb_files (... url ...)` usando `url || null`. A coluna `url` em `t_dachser_chb_files` é `NOT NULL` (sem default), e o auto-registro adicionado em `persistRawOcrForFiles` não envia `url` — então cai em `null` e o insert quebra.

Os arquivos do auto-registro vêm direto do payload da análise (não estão em bucket), então não há URL real para informar.

## Plano (cirúrgico)

Editar apenas `supabase/functions/analyze-chb-documents/index.ts`, dentro do bloco de auto-registro em `persistRawOcrForFiles`:

- Adicionar `url: ''` e `relPath: ''` no payload do `create_chb_file`.
- String vazia satisfaz `NOT NULL` sem inventar URL fictícia. Mantém-se rastreável (registros com `url=''` indicam upload-on-analysis).

Sem alterações no `mariadb-proxy`, sem migração, sem mudança de schema, sem mexer no frontend.

## Validação

- Redeploy de `analyze-chb-documents`.
- Nova análise no item 123.
- Logs esperados: `auto-registered fileId=…` para cada arquivo, depois `extractionId=N status=OK`.
- `SELECT COUNT(*) FROM dados_dachser.t_chb_file_extractions WHERE item_id=123` = nº de arquivos enviados.
