# Corrigir bloqueio excessivo no `update_voucher_esteira`

## Problema

O guard `ETAPAS_EDITAVEIS = ['A_PROCESSAR', 'OPERACAO']` em `supabase/functions/mariadb-proxy/index.ts` (case `update_voucher_esteira`) está bloqueando **qualquer** chamada quando a etapa atual está fora dessa lista — inclusive operações de workflow (mudar `etapa_atual`, registrar comentários, voltar etapa, aprovar, ajustar responsáveis, marcar comprovante etc.). Como praticamente todas as transições do voucher passam por esse mesmo case, isso paralisa o fluxo.

A intenção original (e o que o usuário quer agora) é: bloquear **somente edição de dados do voucher** (campos do `EditVoucherDialog`) quando a etapa não for `A_PROCESSAR` ou `OPERACAO`. Workflow continua livre em qualquer etapa.

No frontend isso já está correto: o botão "Editar Dados" no menu (`VoucherTable.tsx`) e o `EditVoucherDialog` em `VoucherOperacaoActions.tsx` é o único caminho de edição manual.

## Mudança

**Arquivo único:** `supabase/functions/mariadb-proxy/index.ts`, case `update_voucher_esteira`.

1. Definir um conjunto explícito `DATA_EDIT_FIELDS` (somente os campos manipuláveis pelo `EditVoucherDialog`):
   ```
   numero_spo, fornecedor, cnpj_fornecedor, valor, moeda,
   vencimento, data_emissao_documento, cobranca_em_nome_de,
   forma_pagamento, tipo_documento, filial, urgencia_tipo,
   cliente_email, remessa, chave_pix
   ```
2. Detectar se o payload contém algum desses campos (`hasDataEdit`).
3. Aplicar o guard `ETAPAS_EDITAVEIS` **apenas** quando `hasDataEdit === true`. Se o payload trouxer somente campos de workflow (`etapa_atual`, `status_*`, `comentarios_*`, `ajuste_*`, `responsavel_*_user_id`, `aprovado_por_user_id`, `status_documento_fiscal`, `status_comprovante`), seguir sem bloquear.
4. Manter o log de auditoria `VOUCHER_EDICAO_BLOQUEADA` apenas no caminho data-edit, e ajustar a mensagem para ficar clara: "Edição de dados permitida apenas nas etapas A Processar e Operacional".

## Frontend

Sem alterações. O botão "Editar Dados" em `VoucherOperacaoActions.tsx` continua sempre visível na tela da Operação (faz sentido: ali a etapa é OPERACAO/AJUSTE_OPERACAO). O item "Editar" no menu da tabela já é condicionado por `voucher.etapaAtual === "A_PROCESSAR" || "OPERACAO"`.

## Verificação

- Aprovação/retorno em Fiscal, Supervisor, Financeiro voltam a funcionar.
- Tentar salvar pelo `EditVoucherDialog` em voucher fora de A_PROCESSAR/OPERACAO continua retornando 403 com `EDICAO_BLOQUEADA_ETAPA`.
