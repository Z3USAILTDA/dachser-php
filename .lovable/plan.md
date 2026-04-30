## Objetivo

Remover do Lovable Cloud o secret `MARIADB_USER` (e os 4 secrets genéricos irmãos, hoje órfãos) e atualizar o relatório `relatorio_conexoes_mariadb.pdf` refletindo a remoção.

## Contexto verificado

- `rg` em `supabase/functions/` e `src/` confirma **zero** referências aos secrets genéricos (`MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_HOST`, `MARIADB_DATABASE`, `MARIADB_PORT`).
- Todas as 57 edge functions usam pools nomeados (`MARIADB_OPS_*`, `MARIADB_AIR_*`, `MARIADB_SEA_*`, `MARIADB_FIN_*`, `MARIADB_CHARGES_*`).
- Os 5 secrets legados ainda existem no Cloud, mas não são lidos por nada.

## Ações

### 1. Deletar secrets do Lovable Cloud (5 secrets)

Via `delete_secret`:
- `MARIADB_USER`
- `MARIADB_PASSWORD`
- `MARIADB_HOST`
- `MARIADB_DATABASE`
- `MARIADB_PORT`

Justificativa para remover os 5 juntos: sem `MARIADB_USER` (que apontava para `root`), os outros 4 secrets do mesmo conjunto ficam órfãos — removê-los junto evita confusão futura e elimina completamente o vetor de credencial `root`. Se você preferir remover **somente** `MARIADB_USER` e manter os outros, me avise.

### 2. Regenerar `relatorio_conexoes_mariadb.pdf`

Atualizar o script Python que gerou o relatório para refletir:

- **Seção "Pools de Credenciais"**: marcar `MARIADB_USER` (root) como **REMOVIDO** em vez de "legado / a remover".
- **Seção "Remediação de Segurança"**: trocar de "pode ser removido" para "✅ removido em <data>", com nota de que o vetor `root` foi eliminado.
- **Adicionar changelog** ao final do documento:
  - `2026-04-30`: secrets `MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_HOST`, `MARIADB_DATABASE`, `MARIADB_PORT` deletados do Lovable Cloud.
- **Lista de pools ativos** passa a ser: `OPS`, `AIR`, `SEA`, `FIN`, `CHARGES` (sem mais menção a fallback genérico legado).
- Salvar como `/mnt/documents/relatorio_conexoes_mariadb.pdf` (sobrescreve o atual; mantém o nome para continuidade).
- QA visual: converter páginas para imagem e inspecionar antes de entregar.

## Fora de escopo

- Nenhuma mudança em código de edge functions (já feito na rodada anterior).
- Pools nomeados (`MARIADB_OPS_*` etc.) permanecem intactos.

Pode aprovar?
