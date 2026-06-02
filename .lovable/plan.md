## Objetivo

Criar um novo tipo de execução de pagamento **"Pago em ADF"** (`PAGO_ADF`) com fluxo dedicado:

1. Ao definir o tipo como **Pago em ADF**, o voucher é movido para a etapa **ROBO** automaticamente, **sem** acionar `is_pronto_para_robo`.
2. O voucher continua aparecendo na tela `/fin/esteira` → aba **Pagamentos**, podendo ser filtrado pelo tipo "Pago em ADF".
3. Na linha, exibir badge **"Comprovante Anexado"** se houver anexo do tipo `COMPROVANTE` (ou `status_comprovante = 'ANEXADO'/'VALIDADO'`), ou **"Comprovante Pendente"** caso contrário (reutilizar `StatusComprovanteBadge`).
4. **Marcar como pronto só é permitido se o comprovante já estiver anexado.** Caso contrário, o botão fica desabilitado e exibe toast de bloqueio.
5. Quando marcado como pronto, o voucher vai direto para `etapa_atual = 'CONCLUIDO'` (com `status_financeiro = 'CONCLUIDO'`, `status_pagamento = 'PAGO'`, `status_baixa = 'BAIXA_MANUAL'`), **sem** passar pelo robô.

## Mudanças

### 1. Tipos (`src/types/voucher.ts`)

- Adicionar `"PAGO_ADF"` ao tipo `TipoExecucaoPagamento`.
- `TIPO_EXECUCAO_LABELS.PAGO_ADF = "Pago em ADF"`.
- `validarProntoParaRobo`: PAGO_ADF não exige dados bancários nem linha digitável; **exige** `statusComprovante` em `ANEXADO` ou `VALIDADO`.

### 2. Backend (`supabase/functions/mariadb-proxy/index.ts`)

**a) `set_tipo_execucao_pagamento` e `batch_set_tipo_execucao`:**

- Quando `tipo_execucao_pagamento = 'PAGO_ADF'` e `etapa_atual = 'FINANCEIRO'`, mover `etapa_atual` para `'ROBO'` no mesmo UPDATE, **sem** alterar `is_pronto_para_robo`. Registrar log.

**b) `set_ready_for_robo**` (linha ~11844):

- Carregar `status_comprovante` junto com `tipo_execucao_pagamento` e `forma_pagamento`.
- Novo bloco antes do DEBITO: se `is_pronto = true` e `tipoExec === 'PAGO_ADF'`:
  - Se `status_comprovante` ∉ (`ANEXADO`, `VALIDADO`) → retornar `409` com `{ error: 'COMPROVANTE_OBRIGATORIO' }`.
  - Caso contrário, UPDATE: `is_pronto_para_robo=1`, `status_pagamento='PAGO'`, `status_financeiro='CONCLUIDO'`, `status_baixa='BAIXA_MANUAL'`, `etapa_atual='CONCLUIDO'`, `updated_at=NOW()`.
  - Log `'CONCLUIDO_PAGO_ADF'`.
  - Retornar `{ success: true, auto_concluded: true, reason: 'PAGO_ADF' }`.

**c) `list_pagamentos**` (linha 11549):

- Manter `v.etapa_atual IN ('FINANCEIRO', 'ROBO')` — PAGO_ADF em ROBO continua aparecendo.
- Garantir que o SELECT retorna `status_comprovante` para alimentar o badge e o gate do botão.

### 3. UI Pagamentos (`src/components/esteira/PagamentosTab.tsx`)

**a) Selects de tipo de execução** (filtro de cabeçalho ~880, batch dropdown ~1084, select inline ~1282):

- Adicionar opção `<SelectItem value="PAGO_ADF">Pago em ADF</SelectItem>`.

**b) `handleSetReady**` (linha 492):

- Se `tipoExecucao === 'PAGO_ADF'` e `status_comprovante` não estiver em (`ANEXADO`, `VALIDADO`): exibir toast "Comprovante obrigatório — anexe o comprovante de pagamento antes de marcar como pronto" e abortar.
- Tratar resposta `COMPROVANTE_OBRIGATORIO` do backend exibindo mesmo toast.
- Quando `auto_concluded` com reason `PAGO_ADF`, toast "Voucher concluído (Pago em ADF)".

**c) Coluna comprovante / badge na linha:**

- Quando `pag.tipo_execucao_pagamento === 'PAGO_ADF'`, renderizar `<StatusComprovanteBadge status={pag.status_comprovante} />`.

**d) Botão "Marcar como pronto":**

- Para PAGO_ADF, desabilitar quando `status_comprovante` não estiver em (`ANEXADO`, `VALIDADO`); tooltip "Anexe o comprovante antes de marcar como pronto".
- Manter habilitado para PAGO_ADF mesmo quando a etapa já é ROBO.

### 4. Validações auxiliares

- `requiresBankDetails` / `requiresPixKey`: sem alteração.

## Fluxo final

```text
Tipo definido = PAGO_ADF
        │
        ▼
Backend: FINANCEIRO → ROBO  (is_pronto_para_robo = 0)
        │
        ▼
Voucher permanece em Pagamentos
Badge: "Comprovante Pendente"  ──(anexar)──▶  "Comprovante Anexado"
        │
        ▼  (usuário clica "Marcar como pronto")
        │  ── se sem comprovante: bloqueado (toast + botão disabled)
        ▼
set_ready_for_robo detecta PAGO_ADF + comprovante OK
→ etapa_atual = CONCLUIDO
→ status_financeiro = CONCLUIDO
→ status_pagamento = PAGO
(NÃO entra no robô de pagamento)
```

## Fora do escopo

- Sem migração de banco (colunas já são varchar).
- Sem mudança no robô de pagamento — PAGO_ADF nunca é processado por ele.
- Sem mudança em RM/integrações (PAGO_ADF não gera remessa).