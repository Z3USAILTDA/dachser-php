## Problema

Quando um voucher pré-lançado é incluído num lote e consolidado num master, os documentos já anexados ao voucher pré-lançado (NF, boleto, etc. registrados em `t_voucher_anexos` antes de entrar no lote) **não são copiados** para o voucher master criado.

Hoje, em `finalize_batch_import` (`mariadb-proxy/index.ts` ~linha 19517), ao criar o master só inserimos como anexos do master os arquivos que vieram dos `t_voucher_batch_documents` daquele grupo. Os anexos pré-existentes dos filhos (que ficam apontando para o `voucher_id` do filho) são esquecidos.

## Correção (cirúrgica, backend)

No bloco que cria cada master (após `INSERT INTO t_voucher_anexos` dos docs do lote, e antes do log `MASTER_CRIADO_LOTE`), adicionar:

1. `SELECT id, tipo, file_name, file_url, file_size FROM t_voucher_anexos WHERE voucher_id IN (grp.vids)`.
2. Para cada anexo encontrado, inserir uma cópia em `t_voucher_anexos` com `voucher_id = masterId` e novo `id`, **deduplicando** por `(tipo, file_url)` contra os anexos do lote já inseridos no master neste mesmo grupo (para não duplicar caso o mesmo arquivo do pré-lançamento também tenha sido anexado via lote).
3. Manter os anexos originais nos filhos intactos (apenas espelhar no master). Filhos ficam `CONSOLIDADO_NO_MASTER` e não são promovidos.
4. Envolver em try/catch silencioso por anexo, sem abortar a criação do master.

Sem mudança de schema, sem mudança no frontend.

## Arquivo afetado

- `supabase/functions/mariadb-proxy/index.ts` — bloco `finalize_batch_import`, logo após o loop `for (const d of grp.docs)` que cria os anexos de lote no master (~linhas 19517–19529).

## Validação

- Criar lote com 1 voucher normal + 1 pré-lançado que já tem NF/boleto anexados.
- Vincular documento de lote, finalizar.
- Conferir que `t_voucher_anexos` do master contém: docs do lote + anexos originais do pré-lançado (sem duplicatas exatas de `file_url`).