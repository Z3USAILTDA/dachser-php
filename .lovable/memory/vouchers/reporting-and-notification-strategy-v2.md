---
name: vouchers-reporting-and-notification-strategy-v2
description: Estratégia consolidada de notificações da Esteira de Vouchers — apenas 3 alertas ativos (devolução com motivo, urgência manual ao supervisor direto + confirmação separada ao solicitante, relatório mensal).
type: feature
---

A Esteira de Vouchers opera com APENAS 3 alertas por e-mail. Todos os demais (SLA diário, daily report, RM-pending, VOUCHER_ENVIADO em transições normais, VOUCHER_CONCLUIDO, VENCIMENTO_PROXIMO) foram descontinuados.

## Alerta 1 — Voucher devolvido para ajuste (com motivo)

- **Quando:** ação manual em `VoucherFiscalActions`, `VoucherSupervisorActions` ou `VoucherFinanceiroActions` que move o voucher para `AJUSTE_OPERACAO` ou `AJUSTE_FISCAL`, com motivo preenchido.
- **Disparo:** `voucherReturnNotification.ts` → `send-voucher-notification` com `type: "AJUSTE_SOLICITADO"`.
- **Regra inviolável — 1:1, NUNCA broadcast:** ajuste é uma devolução direcionada ao indivíduo que tocou a etapa anterior. NÃO disparar para a área inteira sob nenhuma hipótese.
- **Destinatário (1):**
  - `AJUSTE_OPERACAO` → criador (`creator_email` via `get_voucher_responsaveis_emails`). Fallback: último `user_id` em `t_voucher_logs` com ação `VOUCHER_ENVIADO/RASCUNHO_ENVIADO/MASTER_APROVADO_OPERACAO/REENVIO_APOS_AJUSTE/VOUCHER_CRIADO/RASCUNHO_CRIADO`, resolvendo `email` em `t_users_dachser`. Se nenhum resolver, **abortar silenciosamente** com `{ sent: 0, reason: "no_specific_operacao_recipient" }` — `OPERACAO_FIXED_EMAILS` foi REMOVIDO (era broadcast para 6 pessoas e violava a regra 1:1).
  - `AJUSTE_FISCAL` → último fiscal (`fiscal_email`). Resolução em duas camadas em `mariadb-proxy → get_voucher_responsaveis_emails`:
    1. Primário: `t_vouchers.responsavel_fiscal_user_id` (persistido em `update_voucher_esteira` quando o fiscal aprova/devolve).
    2. Fallback: último `user_id` do log com ação `APROVADO_FISCAL` ou `REENVIO_APOS_AJUSTE` em `t_voucher_logs`, resolvendo `email` em `t_users_dachser`.
  - Se ambas as camadas falharem (voucher legado sem nenhum log fiscal), `send-voucher-notification` aborta com `{ sent: 0, reason: "no_specific_fiscal_recipient" }`. **Nunca** cai em `getRecipientEmails(["FISCAL","GESTOR_FISCAL"])` — esse broadcast foi removido.
- **Conteúdo:** número, etapa origem→destino, motivo, link.

## Regra-mestra 1:1 (guard final)

`send-voucher-notification` aplica um GUARD antes do `resend.emails.send`: se `toEmails.length > 1`, trunca para o primeiro e zera `cc`. Qualquer e-mail desta função vai para EXATAMENTE 1 destinatário. A única exceção autorizada é o relatório mensal, que usa edge function dedicada (`voucher-monthly-report`) e não passa por aqui.

`URGENCIA_APROVADA` e `URGENCIA_REJEITADA` mandam **somente** ao solicitante. O supervisor já tomou a decisão clicando no link e não recebe CC.

## Alerta 2 — Urgência manual solicitada → Supervisor direto (+ confirmação ao solicitante)

- **Quando:** voucher criado/editado com `urgencia_tipo === 'URGENTE_REAL'` (checkbox "Pagamento Urgente"). NÃO dispara para `URGENTE_AUTOMATICO`.
- **Disparo:** `CreateVoucherDialog.tsx` e `VoucherOperacaoActions.tsx` enviam DOIS e-mails independentes (try/catch isolados):
  1. `type: "URGENCIA_SOLICITADA"` → supervisor (com botões Aprovar/Rejeitar).
  2. `type: "URGENCIA_SOLICITADA_CONFIRMACAO"` → solicitante (informativo, sem botões).

### E-mail ao Supervisor (`URGENCIA_SOLICITADA`)
- **TO:** supervisor direto do solicitante (`creator_supervisor_email`, resolvido via `t_users_dachser.supervisor_id` configurado em `/admin/users`). Fallback: todos `SUPERVISOR` + `GESTOR_SUPERVISOR` ativos.
- **CC:** vazio. **Solicitante NÃO recebe cópia** — controle de segurança: a posse do link com tokens 48h é o controle de acesso, então só o supervisor deve receber os botões. Isso elimina auto-aprovação por encaminhamento ou acesso direto à caixa do solicitante.
- **Reply-To:** solicitante — supervisor responde direto a quem pediu, fora do fluxo dos botões.
- **Conteúdo:** dados do voucher, motivo, anexos, botões Aprovar/Rejeitar (`supervisor-approve.html` / `supervisor-reject.html`, tokens 48h, uso único, validados em `supervisor-email-action`).

### E-mail informativo ao Solicitante (`URGENCIA_SOLICITADA_CONFIRMACAO`)
- **TO:** apenas `creator_email`. Sem CC, sem Reply-To especial.
- **Conteúdo:** mensagem curta confirmando que a solicitação foi enviada ao supervisor responsável e que ele será notificado quando houver aprovação/rejeição. **Sem botões de ação, sem anexos.**

### Resposta automática ao solicitante após decisão (mantida — fluxo já testado)

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
- CC do solicitante em `URGENCIA_SOLICITADA` (removido em 2026-04-22 — substituído pelo e-mail dedicado `URGENCIA_SOLICITADA_CONFIRMACAO` por motivo de segurança: evita que o solicitante receba os tokens de aprovação).
- Broadcast para `["FISCAL","GESTOR_FISCAL"]` no ramo `AJUSTE_SOLICITADO/AJUSTE_FISCAL` (removido em 2026-04-23 — substituído por fallback de log em `get_voucher_responsaveis_emails` + abort silencioso quando nenhum destinatário específico é resolvido).
