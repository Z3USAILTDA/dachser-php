# Importação em Lote de Vouchers/SPO por Planilha

Funcionalidade nova, isolada e exclusiva para ADMIN no módulo Esteira (`/fin/esteira`). Não altera nenhum fluxo existente (manual, RM/Othello, remessa, baixa, comprovante, master, robô, dashboard, relatórios).

## 1. Arquivos a criar

### Frontend (novos)
- `src/utils/batchVoucherImport.ts` — parsing CSV/XLSX, normalização (datas BR, valores BR, mapeamento forma de pagamento), validação client-side preliminar.
- `src/components/esteira/BatchImportVoucherDialog.tsx` — modal wizard em 3 passos: Upload planilha → Preview/validação → Confirmação de criação.
- `src/components/esteira/BatchImportPreviewTable.tsx` — tabela do preview com badges VALID/WARNING/ERROR e mensagens por linha.
- `src/components/esteira/BatchDocumentUploadPanel.tsx` — área de upload múltiplo (drag & drop) que chama `upload_batch_document` por arquivo, mostra status PENDENTE/VINCULADO.
- `src/components/esteira/BatchDocumentBinderDialog.tsx` — tela 2 colunas: docs do lote ↔ vouchers do lote, com seletor de `tipo_anexo` e ações Vincular/Desvincular. Botão "Finalizar lote" (bloqueado se houver pendência).
- `src/components/esteira/BatchVoucherChecklist.tsx` — componente reutilizável que mostra status COMPLETO/PENDENTE_FATURA/PENDENTE_BOLETO/PENDENTE_FATURA_E_BOLETO/COM_ERRO por voucher.

### Backend (novos)
Tudo dentro do edge function existente `supabase/functions/mariadb-proxy/index.ts` (sem novas funções) — apenas novos `case` no switch.

## 2. Arquivos a alterar (mínimo)

- `src/pages/esteira/EsteiraIndex.tsx` — apenas:
  - importar `BatchImportVoucherDialog` e `BatchDocumentBinderDialog`;
  - adicionar botão "Importar SPO em Lote" condicionado a `isAdmin` no mesmo header onde fica o botão "Novo Voucher" (`CreateVoucherDialog`);
  - estados `showBatchDialog`, `activeBatchId` e `showBinderDialog`;
  - callback `onBatchCreated(batchId)` que abre o binder e ao final chama `loadVouchers()`.
  Nenhuma outra mudança no arquivo.

- `supabase/functions/mariadb-proxy/index.ts` — adicionar 7 novos `case` (`preview_voucher_batch_import`, `create_voucher_batch_import`, `upload_batch_document`, `bind_batch_document_to_voucher`, `unbind_batch_document`, `get_batch_import_status`, `finalize_batch_import`). Cada um valida `is_admin = 1` no início; em caso negativo retorna `{ success: false, error: "Acesso negado. Funcionalidade permitida apenas para ADMIN." }`. Reutiliza helpers já existentes para inserir voucher, gravar log e inserir anexo (não duplicar lógica).

## 3. Tabelas novas (MariaDB, não Supabase)

Criar via DDL aplicado no MariaDB de FIN — entregar o SQL no chat para o usuário executar (mesma prática do projeto, já que migrations Supabase não atingem MariaDB).

- `t_voucher_batch_import`: id, status (DRAFT/CREATED/PENDING_DOCUMENTS/COMPLETE/CANCELLED/ERROR), original_file_name, total_rows, valid_rows, error_rows, created_by_user_id, created_by_user_name, created_at, finalized_at, finalized_by_user_id, finalized_by_user_name.
- `t_voucher_batch_import_item`: id, batch_id, row_index, voucher_id (NULL até criação), processo, item_pagto, fornecedor, valor, vencimento, data_fatura, forma_pagamento, fatura, unidade_pagto, historico, quebra, status (VALID/WARNING/ERROR/VOUCHER_CREATED), validation_message, raw_json, created_at.
- `t_voucher_batch_documents`: id, batch_id, voucher_id (NULL até vínculo), anexo_id (NULL até vínculo), file_name, file_url, file_path, mime_type, size_bytes, tipo_anexo, status (PENDENTE/VINCULADO/IGNORADO), uploaded_by_user_id, uploaded_by_user_name, uploaded_at, bound_by_user_id, bound_by_user_name, bound_at.

Charset `utf8mb4 COLLATE utf8mb4_unicode_ci`. Nenhuma alteração em tabelas existentes.

## 4. Mapeamento e validações de planilha

Colunas aceitas (case-insensitive, acentos tolerados):

```text
Processo            -> processoId        (recomendado)
Item Pagto          -> itemPagto         (auxiliar)
Fornecedor          -> fornecedor        (OBRIGATÓRIO)
Vencimento          -> vencimento        (prioritário, OBRIGATÓRIO)
Data Vencimento     -> vencimento        (fallback)
Valor Solicitação   -> valor             (OBRIGATÓRIO, > 0)
Fatura              -> fatura            (OBRIGATÓRIO referência)
Unidade Pagto       -> unidadePagto      (auxiliar)
Data fatura         -> dataEmissaoDocumento
Forma Pagto         -> formaPagamento    (OBRIGATÓRIO, mapear enum)
Historico           -> comentariosOperacao
Quebra              -> quebra            (auxiliar)
```

Mapa forma de pagamento (case-insensitive, com/sem acento): BOLETO, PIX, TRANSFERENCIA, DEPOSITO, DARF, GPS, CAMBIO, ADF, CARTAO. Se não reconhecida → linha ERROR.

Linhas inválidas viram ERROR no preview e não geram voucher. Voucher criado nasce com `origemCriacao = "LOTE_PLANILHA"` e na etapa padrão atual (RASCUNHO/OPERACAO conforme regra existente — reutilizar mesma lógica de `CreateVoucherDialog`/`insert_voucher`). Sem RM, sem remessa, sem avanço automático.

## 5. Anexos e checklist

Reutilizar regra existente:
- `temFatura` = anexo do voucher com `tipo_anexo IN ('FATURA','FATURA_DEMONSTRATIVO')`.
- `temBoleto` = anexo do voucher com `tipo_anexo IN ('BOLETO','BOLETO_INSTRUCOES')`.
- Voucher pendente se faltar FATURA, ou se `formaPagamento='BOLETO'` e faltar BOLETO.
- `finalize_batch_import` retorna 422 com `pendentes: [{voucher_id, motivo}]` enquanto houver pendência.

Upload físico dos arquivos: bucket Supabase `voucher-anexos` (já existe). `upload_batch_document` apenas registra metadata + path; o upload binário é feito pelo frontend via `supabase.storage` antes de chamar a action (mesmo padrão do fluxo individual).

## 6. Logs (`t_vouchers_logs`)

`VOUCHER_CRIADO_LOTE`, `ANEXO_VINCULADO_LOTE`, `ANEXO_DESVINCULADO_LOTE`, `IMPORTACAO_LOTE_FINALIZADA`, `IMPORTACAO_LOTE_CANCELADA`, `IMPORTACAO_LOTE_ERRO` — payload com `batch_id`, `voucher_id`, `tipo_anexo`, `file_name`, usuário e `payload_json` quando aplicável.

## 7. Segurança

- Frontend: botão e dialogs só renderizam se `isAdmin` (de `useUserRole`).
- Backend: cada novo `case` verifica `is_admin = 1` consultando `t_users` por `userId` (mesmo padrão usado em outras actions admin do proxy). Sem fallback.
- `bind_batch_document_to_voucher`: valida que `batch_document.batch_id === voucher.batch_id` (voucher precisa ter sido criado pelo mesmo batch — checado via `t_voucher_batch_import_item.voucher_id`).
- `unbind_batch_document`: invalida `t_voucher_batch_documents.status='PENDENTE'` e remove o registro espelho em `t_vouchers_anexos` (somente o criado pelo lote, identificado via `anexo_id` salvo no batch document).
- Nunca tocar em vouchers/anexos fora do batch.

## 8. Fluxo UX

```text
[Esteira header] "Importar SPO em Lote" (admin)
    └─> BatchImportVoucherDialog
          1. Upload .csv/.xlsx
          2. Preview (BatchImportPreviewTable) com VALID/WARNING/ERROR
          3. Confirmar -> create_voucher_batch_import
                          -> redireciona para BatchDocumentBinderDialog(batchId)
[BatchDocumentBinderDialog]
    ├─ BatchDocumentUploadPanel (upload N arquivos -> upload_batch_document)
    ├─ Esquerda: docs do lote (PENDENTE/VINCULADO)
    ├─ Direita: vouchers do lote + BatchVoucherChecklist
    ├─ Vincular (tipo_anexo) / Desvincular
    └─ "Finalizar lote" (bloqueado se houver pendência)
```

## 9. Critérios de aceite

- Não-admin: botão invisível e actions retornam erro de acesso negado.
- Vouchers criados em lote aparecem na listagem da Esteira normalmente, sem afetar fluxo manual.
- Lote não finaliza enquanto houver `PENDENTE_FATURA`/`PENDENTE_BOLETO`.
- Logs gravados conforme item 6.
- Nenhum arquivo fora da lista do item 1 e 2 é tocado.

## 10. Itens NÃO incluídos (por design)

- Sem auto-match documento↔voucher por nome de arquivo.
- Sem disparo de RM/remessa/robô/avanço de etapa.
- Sem alteração de enums globais, roles, dashboard, relatórios.
- Sem mudança nas actions existentes do proxy.
