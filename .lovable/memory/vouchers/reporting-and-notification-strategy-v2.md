---
name: vouchers-reporting-and-notification-strategy-v2
description: Estratégia consolidada de notificações da Esteira de Vouchers — apenas 3 alertas ativos (devolução com motivo, urgência manual ao supervisor direto com resposta automática ao solicitante, relatório mensal).
type: feature
---

A Esteira de Vouchers opera com APENAS 3 alertas por e-mail. Todos os demais (SLA diário, daily report, RM-pending, VOUCHER_ENVIADO em transições normais, VOUCHER_CONCLUIDO, VENCIMENTO_PROXIMO) foram descontinuados.

## Alerta 1 — Voucher devolvido para ajuste (com motivo)

- **Quando:** ação manual em `VoucherFiscalActions`, `VoucherSupervisorActions` ou `VoucherFinanceiroActions` que move o voucher para `AJUSTE_OPERACAO` ou `AJUSTE_FISCAL`, com motivo preenchido.
- **Disparo:** `voucherReturnNotification.ts` → `send-voucher-notification` com `type: "AJUSTE_SOLICITADO"`.
- **Destinatário (1):**
  - `AJUSTE_OPERACAO` → criador (`creator_email` via `get_voucher_responsaveis_emails`). Fallback: `OPERACAO_FIXED_EMAILS`.
  - `AJUSTE_FISCAL` → último fiscal (`fiscal_email`). Fallback: roles FISCAL/GESTOR_FISCAL.
- **Conteúdo:** número, etapa origem→destino, motivo, link.

## Alerta 2 — Urgência manual solicitada → Supervisor direto

- **Quando:** voucher criado/editado com `urgencia_tipo === 'URGENTE_REAL'` (checkbox "Pagamento Urgente"). NÃO dispara para `URGENTE_AUTOMATICO`.
- **Disparo:** `CreateVoucherDialog.tsx` e `VoucherOperacaoActions.tsx` → `send-voucher-notification` com `type: "URGENCIA_SOLICITADA"`.
- **Destinatários:**
  - **TO:** supervisor direto do solicitante (`creator_supervisor_email`, resolvido via `t_users_dachser.supervisor_id` configurado em `/admin/users`). Fallback: todos `SUPERVISOR` + `GESTOR_SUPERVISOR` ativos.
  - **CC:** o próprio solicitante (`creator_email`).
  - **Reply-To:** solicitante — supervisor responde direto a quem pediu.
- **Conteúdo:** dados do voucher, motivo da urgência, anexos, e dois botões (Aprovar / Rejeitar) que apontam para `supervisor-approve.html` / `supervisor-reject.html` (tokens 48h, uso único, validados em `supervisor-email-action`).

### Resposta automática ao solicitante (mantida — fluxo já testado)

Após o supervisor clicar Aprovar/Rejeitar pelo link:
- `supervisor-email-action` dispara `URGENCIA_APROVADA` ou `URGENCIA_REJEITADA` (com motivo) em `send-voucher-notification`.
- Roteamento: TO = solicitante (`creator_email`), CC = supervisor (`creator_supervisor_email`).

## Alerta 3 — Relatório mensal de processados

- **Quando:** cron `pg_cron` disparado mensalmente — `voucher-monthly-report`.
- **Destinatários (relatório completo):** resolvidos dinamicamente em `t_users_dachser` (esteira_active=1) com `esteira_role` ∈ `{SUPERVISOR, GESTOR_SUPERVISOR, FINANCEIRO, GESTOR_FINANCEIRO, ADMIN}`. Constante `REPORT_ROLES` na função. Override de teste (`larissa@z3us.ai`) foi REMOVIDO de TODOS os 3 alertas — confirmado por inspeção em 2026-04-22.
- **Destinatários (relatórios segmentados Fiscal/Operação/Supervisor/Financeiro):** roles correspondentes em `t_users_dachser` **+** `SEGMENT_EXTRA_EMAILS` hardcoded — INTENCIONAL: `marta.silva@dachser.com` (FISCAL), `cleiciane.faconi@dachser.com` e `luciana.vulcano@dachser.com` (OPERACAO) não têm login na Esteira mas precisam receber. NÃO remover sem antes cadastrá-las em `/admin/users` com a role correspondente.
- **Conteúdo:** vouchers `CONCLUIDO` no mês + em andamento, KPIs, anexo XLSX.

## Itens removidos

- Edge functions: `voucher-check-sla-alerts`, `voucher-send-daily-report`, `voucher-notify-rm-pending` (apagadas; crons devem ser removidos manualmente em `cron.job`).
- Branches `VOUCHER_ENVIADO`, `VOUCHER_CONCLUIDO`, `VENCIMENTO_PROXIMO` em `send-voucher-notification` (apagados).
- Disparo `VOUCHER_ENVIADO` ao Financeiro em `supervisor-email-action` após aprovação (apagado — supervisor recebe confirmação só via UI).
- `STAGE_TO_ROLES` em `src/utils/esteiraNotifications.ts` permanece apenas como utilitário do mapeamento (não usado em transições normais).
