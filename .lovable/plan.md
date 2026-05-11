## Diagnóstico

A coluna "Já na etapa Aguardando_documentos_lote" aparece no **preview** da importação. Isso significa que ainda existem vouchers reais em `t_vouchers` com `etapa_atual = 'AGUARDANDO_DOCUMENTOS_LOTE'` que sobreviveram à limpeza anterior.

Causas identificadas no `runAbandonedCleanup` atual:

1. A limpeza só apaga vouchers vinculados a um lote com `status = 'PENDING_DOCUMENTS'`. Vouchers cujo lote já foi marcado `COMPLETED` / `PROCESSING` / removido / com outro status — mas o voucher ficou parado em `AGUARDANDO_DOCUMENTOS_LOTE` — nunca são limpos.
2. A auto-limpeza é disparada **apenas** dentro de `create_voucher_batch_import` e com `scope = 'USER'`. Quando o usuário ainda está na tela de **preview**, ou quando o lote abandonado foi criado por outro usuário, os vouchers permanecem visíveis como "já existe".
3. Vouchers órfãos (sem item correspondente em `t_voucher_batch_import_item`) ficam fora da query atual, que se baseia no join via `batch_id`.

## Correções

### 1. Limpeza mais agressiva (helper `runAbandonedCleanup`)
Em vez de deletar somente vouchers ligados a lotes `PENDING_DOCUMENTS`, a função passa a deletar **qualquer** voucher com `etapa_atual = 'AGUARDANDO_DOCUMENTOS_LOTE'` que se enquadre no escopo (USER ou ALL), junto com seus logs/anexos e os registros relacionados em `t_voucher_batch_import_item` / `t_voucher_batch_documents`. Lotes em `PENDING_DOCUMENTS` também são apagados como hoje.

Lógica:
- `DELETE FROM t_vouchers WHERE etapa_atual='AGUARDANDO_DOCUMENTOS_LOTE' AND (scope ALL OR criado_por_user_id = ?)`
- Limpar `t_voucher_logs` / `t_voucher_anexos` desses ids.
- Para os `batch_id` afetados (via item), apagar `t_voucher_batch_documents`, `t_voucher_batch_import_item` e o `t_voucher_batch_import` quando ele estiver em `PENDING_DOCUMENTS`.

### 2. Disparar limpeza também no preview
Em `preview_voucher_batch_import`, chamar `runAbandonedCleanup({ scope: 'USER', userId: requesterId })` antes do `fetchExistingVouchers`. Garante que o badge "Já na etapa…" não apareça por causa de tentativas anteriores abandonadas pelo próprio usuário.

### 3. One-shot global
Após o deploy, rodar `cleanup_abandoned_batch_imports` com `scope='ALL'` uma vez para zerar a base.

### 4. Sem mudanças de UI
Nenhuma alteração visual é necessária; o badge segue o mesmo, ele só vai parar de aparecer porque não haverá mais vouchers órfãos.

## Arquivos afetados

- `supabase/functions/mariadb-proxy/index.ts` — atualizar `runAbandonedCleanup` e adicionar a chamada no início de `preview_voucher_batch_import`.
- Execução pós-deploy: chamada única à action `cleanup_abandoned_batch_imports` com `scope='ALL'`.
