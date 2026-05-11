## Objetivo

Eliminar SPOs "fantasmas" que ficam parados na etapa **AGUARDANDO_DOCUMENTOS_LOTE** quando o usuário começa uma importação em lote e não conclui o fluxo (anexar documentos + finalizar).

Hoje, ao clicar em "Importar lote", o backend já cria registros reais em `t_vouchers` com `etapa_atual = 'AGUARDANDO_DOCUMENTOS_LOTE'`. Se o usuário fechar o navegador ou abandonar o processo, esses vouchers continuam visíveis e nunca avançam.

## Mudanças

### 1. Limpeza dos SPOs já existentes (one-shot)

Apagar os vouchers atualmente parados em `AGUARDANDO_DOCUMENTOS_LOTE` cujo lote não foi finalizado, junto com seus rastros no batch import:

- Marcar os lotes em `t_voucher_batch_import` com `status='PENDING_DOCUMENTS'` (não finalizados) como `ABANDONED`.
- Apagar de `t_vouchers` todas as linhas com `etapa_atual = 'AGUARDANDO_DOCUMENTOS_LOTE'` e `origem_criacao = 'LOTE_PLANILHA'` que pertencem a esses lotes (via `t_voucher_batch_import_item.voucher_id`).
- Apagar logs órfãos de `t_voucher_logs` desses voucher_ids.
- Apagar registros pendentes em `t_voucher_batch_documents` ainda não vinculados a voucher real (já que voucher não existe mais).
- Apagar `t_voucher_batch_import_item` desses lotes (zerando o rastro).

Operação executada via Edge Function `mariadb-proxy` (action one-shot `cleanup_abandoned_batch_imports`) — chamada manualmente uma única vez pela UI ou pelo agente.

### 2. Mudança de comportamento (frontend + backend)

**Não criar mais vouchers reais até a finalização do lote.**

- `create_voucher_batch_import` deixa de inserir em `t_vouchers`. Apenas grava em `t_voucher_batch_import` + `t_voucher_batch_import_item` (já existente), mantendo `voucher_id = NULL`.
- A tela de "Aguardando documento" passa a ler do par `t_voucher_batch_import_item` + `t_voucher_batch_documents` (já é o que `get_batch_import_status` retorna), sem depender de `t_vouchers`.
- `bind_batch_document_to_voucher` e `bind_batch_document_to_master_group` passam a operar por `batch_import_item.id` (não mais por `voucher_id`).
- `finalize_batch_import` ganha a responsabilidade de **criar agora** os vouchers em `t_vouchers` (individuais e masters), aplicando as mesmas regras hoje usadas no `create_voucher_batch_import` (etapa destino, urgência, status_envio_cliente, etc.) e só então vincular os anexos já enviados.
- Se o usuário abandonar o lote no meio, nenhum SPO aparece em lugar nenhum — apenas o registro interno de `t_voucher_batch_import` permanece (com `status='PENDING_DOCUMENTS'`) e pode ser retomado ou expirado.

### 3. Expiração automática (opcional, mesma migração)

Adicionar limpeza automática para lotes não finalizados:

- Cron diário (ou job sob demanda no `mariadb-proxy`) que marca como `ABANDONED` qualquer `t_voucher_batch_import` com `status='PENDING_DOCUMENTS'` e `created_at < NOW() - INTERVAL 7 DAY`, removendo os documentos pendentes vinculados.
- Como não há mais vouchers reais antes da finalização, essa limpeza é puramente nas tabelas de lote (sem impacto em `t_vouchers`).

## Arquivos afetados

- `supabase/functions/mariadb-proxy/index.ts`
  - Nova action `cleanup_abandoned_batch_imports` (one-shot) — passo 1.
  - `create_voucher_batch_import`: remover bloco de `INSERT INTO t_vouchers`.
  - `bind_batch_document_to_voucher` / `bind_batch_document_to_master_group`: passar a operar por `batch_import_item_id`.
  - `get_batch_import_status`: retornar dados sem depender de `t_vouchers`.
  - `finalize_batch_import`: passar a criar os `t_vouchers` (individuais + masters) usando o snapshot do item, e só depois associar anexos / promover etapa.
  - (Opcional) cron `expire_pending_batches`.
- `src/components/esteira/BatchDocumentBinderDialog.tsx`, `BatchVoucherChecklist.tsx`, `BatchImportPreviewTable.tsx`, `BatchImportVoucherDialog.tsx`
  - Trocar referências de `voucher_id` por `batch_import_item_id` ao listar/vincular documentos.

## Pontos a confirmar antes de implementar

1. Confirmar a execução do passo 1 (deleção física dos vouchers já existentes em `AGUARDANDO_DOCUMENTOS_LOTE` de lotes não finalizados). Alternativa: apenas marcar como `CANCELADO` e manter histórico.
2. Confirmar prazo de expiração automática do passo 3 (sugestão: 7 dias). Se não for desejado agora, pode ficar fora do escopo.