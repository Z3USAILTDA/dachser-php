

## Fix: Deploy da Edge Function `parse-manifest-swap`

### Problema Identificado

A edge function `parse-manifest-swap` nao foi deployada com sucesso. O request do frontend retorna "Failed to fetch" e nao ha nenhum log no servidor (nem boot). O codigo da function e o config.toml estao corretos.

### Causa Provavel

O deploy automatico pode ter falhado silenciosamente. Isso pode acontecer por incompatibilidade do `deno.lock` ou por um problema transitorio no deploy.

### Solucao

Forcar o re-deploy da function fazendo uma alteracao minima no arquivo (adicionar um comentario de versao no topo). Isso vai triggerar um novo deploy automatico.

### Detalhes Tecnicos

**Arquivo**: `supabase/functions/parse-manifest-swap/index.ts`

- Adicionar um comentario de versao no topo do arquivo (ex: `// v1.0 - parse-manifest-swap`)
- Isso forca o sistema de deploy a reprocessar a function
- Nenhuma alteracao logica necessaria - o codigo esta correto

Apos o deploy, o fluxo completo deve funcionar:
1. Upload do PDF no frontend
2. Request chega ao `parse-manifest-swap`
3. Gemini 3 Pro extrai MAWB + HAWBs
4. Preview aparece na tabela
5. Confirmacao atualiza `t_cadastro_aereo` via `olimpo-proxy`

