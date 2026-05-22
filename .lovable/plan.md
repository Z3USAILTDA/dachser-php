## Objetivo

No modal **Importar SPO em Lote** (esteira de vouchers), adicionar um botão **"Fechamento quinzenal"** ao lado de "Selecionar arquivo (.csv / .xlsx)". Ao clicar, o usuário pula totalmente a etapa de importação de planilha e vai direto para o passo de **Vincular documentos em lote**, listando todos os pré-lançados ATIVOS disponíveis (sem filtrar por fornecedores de uma planilha, já que não há planilha).

Caso de uso: no fechamento quinzenal nada novo precisa ser cadastrado — só anexar faturas/boletos aos vouchers que já estão pré-lançados.

## Mudanças

### 1. Frontend — `src/components/esteira/BatchImportVoucherDialog.tsx`

- No `step === "upload"` (perto do botão "Selecionar arquivo"), adicionar um segundo botão secundário **"Fechamento quinzenal"** com um ícone (ex.: `CalendarCheck`).
- Ao clicar: chamar `mariadb-proxy` com a action nova `create_empty_batch_import` (modo "fechamento"), receber o `batchId` retornado e disparar `onCreated(batchId)` — o mesmo callback que hoje abre o `BatchDocumentBinderDialog`.
- Fechar o próprio modal de importação.
- Adicionar texto curto de ajuda abaixo do botão explicando que essa opção lista todos os pré-lançados sem precisar de planilha.

### 2. Frontend — `src/components/esteira/BatchDocumentBinderDialog.tsx`

- O binder já carrega via `get_batch_import_status` (checklist fica vazio quando o batch não tem itens) e a busca de pré-lançados via `search_pre_lancamento_by_fornecedores`.
- Detectar o `tipo = 'FECHAMENTO_QUINZENAL'` retornado em `get_batch_import_status` e, nesse caso, mostrar um header indicando "Modo Fechamento Quinzenal" e ocultar a seção de "Vouchers do lote" (que estará vazia) — exibir apenas o painel de pré-lançados + upload/vinculação de documentos.
- Reuso integral do restante (upload, vinculação, finalização).

### 3. Backend — `supabase/functions/mariadb-proxy/index.ts`

- Adicionar nova action `create_empty_batch_import`:
  - Faz `INSERT` em `t_voucher_batch_import` com `tipo = 'FECHAMENTO_QUINZENAL'` (nova coluna VARCHAR, default `'PLANILHA'`), `user_id`, `created_at`. Sem itens em `t_voucher_batch_import_item`.
  - Retorna `{ success: true, batch_id }`.
  - Auto-cleanup de batches abandonados continua valendo.
- Ajustar `search_pre_lancamento_by_fornecedores`:
  - Se o batch correspondente for do tipo `FECHAMENTO_QUINZENAL` (ou se não houver fornecedores no batch), retornar **todos** os vouchers pré-lançados ATIVOS, sem filtro por fornecedor — ordenados por vencimento.
- Ajustar `get_batch_import_status` para incluir `tipo` no payload de resposta.
- `finalize_batch_import` permanece igual — funciona porque o que finaliza são as vinculações de pré-lançados anexados ao batch.

### 4. Migração SQL

- `ALTER TABLE dados_dachser.t_voucher_batch_import ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) NOT NULL DEFAULT 'PLANILHA'` (executado defensivamente também no início do handler, padrão já usado no arquivo).

## Fora de escopo

- Não alterar lógica de pré-lançados existentes nem o fluxo normal de importação por planilha.
- Não criar nova tela — reuso total do `BatchDocumentBinderDialog`.
- Não mexer em permissões/roles (mesmo perfil que hoje abre a importação).