## Objetivo

Permitir importar SPOs em modo **"Pré-Lançamento"** (sem documentos), e depois, no diálogo **"Vincular documentos ao lote"**, buscar SPOs pré-lançados de um fornecedor para anexar fatura/boleto junto com os SPOs do lote atual.

## Fluxo do usuário

1. Em **Esteira → Importar SPOs em lote**: além do botão "Importar", surge **"Pré-Lançamento"**. Mesmo parser/validação, mas os vouchers são gravados marcados como pré-lançados e **não exigem documentos** — o lote é encerrado já no upload.
2. Em **Vincular documentos ao lote** (após uma importação normal): novo bloco **"Buscar SPOs do fornecedor"** lista vouchers pré-lançados dos mesmos fornecedores presentes no lote atual. O usuário marca quais quer trazer; ao confirmar, eles entram no checklist do lote vigente, podendo receber a mesma fatura/boleto (master) junto com os SPOs já listados.
3. Ao finalizar o lote, vouchers que receberam documento perdem o flag de pré-lançamento e seguem o fluxo normal (FISCAL/OPERACAO conforme regras existentes).

## Onde fica armazenado

Adicionar a coluna `is_pre_lancamento BOOLEAN DEFAULT FALSE` em `t_vouchers` (MariaDB). Mantém etapa `RASCUNHO`, sem novos enums — coerente com a memória "Surgical Implementation Preference". Vouchers pré-lançados ficam ocultos do fluxo normal por filtros e só aparecem quando explicitamente buscados via fornecedor.

## Mudanças

### Backend (edge function `mariadb-proxy`)
- `create_batch_import` / `insert_batch_voucher`: aceita flag `pre_lancamento: boolean`. Quando true, grava `is_pre_lancamento = 1` e marca o lote já como finalizado (sem exigir anexos).
- Novo action `search_pre_lancamento_by_fornecedores`: recebe `{ batch_id }` ou `{ fornecedores: string[] }` e retorna vouchers com `is_pre_lancamento = 1` daqueles fornecedores (id, numero_spo, fornecedor, valor, vencimento, forma_pagamento, id_rm).
- Novo action `attach_pre_lancamento_to_batch`: recebe `{ batch_id, voucher_ids }`. Vincula esses vouchers ao lote (mesma tabela do checklist usada em `get_batch_import_status`) sem alterar etapa ainda.
- `bind_batch_document_to_master_group` / `bind_batch_document_to_voucher`: quando o voucher vinculado tinha `is_pre_lancamento = 1`, limpa o flag.
- `finalize_batch_import`: ignora pendência de documento para vouchers que continuam `is_pre_lancamento = 1` (eles permanecem pré-lançados, sem promoção).

### Frontend
- **`BatchImportVoucherDialog.tsx`**: no rodapé do step `preview`, adicionar botão secundário **"Pré-Lançamento"** ao lado do "Confirmar importação". Mesma chamada de criação, com `pre_lancamento: true`. Após sucesso, exibe toast e fecha — não abre o `BatchDocumentBinderDialog`.
- **`BatchDocumentBinderDialog.tsx`**:
  - Novo bloco compacto acima do grid (ou colapsável dentro da coluna "Vouchers do lote") com título **"Buscar SPOs do fornecedor"**, mostrando os fornecedores únicos do lote atual e um botão "Buscar pré-lançados".
  - Ao clicar: chama `search_pre_lancamento_by_fornecedores`, abre um sub-painel listando os SPOs encontrados (checkbox + SPO + fornecedor + valor + vencimento).
  - Botão **"Adicionar ao lote"** chama `attach_pre_lancamento_to_batch` e recarrega o checklist; novos vouchers aparecem na lista normal e podem ser selecionados como qualquer outro (inclusive em master).
  - Badge discreto "Pré-lançado" nos itens recém adicionados.

## Fora de escopo
- Cadastro manual em `EsteiraManual` (somente importação em lote, conforme exemplo na tela atual).
- Mudar etapas/enums.
- Notificações para SPOs pré-lançados.
