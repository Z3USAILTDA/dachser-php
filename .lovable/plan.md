

## Plano final — 3 alertas da Esteira

### Alerta 1 — Voucher devolvido para ajuste (com motivo)

**Quando:** ação manual em `VoucherFiscalActions`, `VoucherSupervisorActions` ou `VoucherFinanceiroActions` que move o voucher para `AJUSTE_OPERACAO` ou `AJUSTE_FISCAL`, com motivo preenchido.

**Para quem (1 destinatário):**
- `AJUSTE_OPERACAO` → criador do voucher (`t_vouchers.criado_por_user_id` → email em `t_users_dachser`).
- `AJUSTE_FISCAL` → último fiscal que tocou o voucher (resolvido via `t_voucher_logs` da etapa FISCAL mais recente).

**Conteúdo:** número do voucher, etapa de origem, etapa destino, motivo, link.

**Implementação:** mantém `voucherReturnNotification.ts` + branch `AJUSTE_SOLICITADO` em `send-voucher-notification`.

---

### Alerta 2 — Urgência manual solicitada → Supervisor direto

**Quando:** voucher criado/editado com `urgencia_tipo === 'URGENTE_REAL'` (checkbox "Pagamento Urgente"). Não dispara para `URGENTE_AUTOMATICO`.

**Destinatários:**
- **TO:** supervisor direto do solicitante, via `t_users_dachser.supervisor_id` (já configurado em `/admin/users`).
- **CC:** o próprio solicitante (`criado_por_user_id` → email em `t_users_dachser`), para acompanhamento.

```sql
SELECT s.email AS supervisor_email, s.username AS supervisor_username,
       u.email AS solicitante_email, u.username AS solicitante_username
FROM ai_agente.t_users_dachser u
LEFT JOIN ai_agente.t_users_dachser s
       ON s.id = u.supervisor_id AND s.esteira_active = 1 AND s.email <> ''
WHERE u.id = ?;
```

**Fallback** (sem supervisor cadastrado / inativo): TO = todos `SUPERVISOR` ativos, com aviso "solicitante sem supervisor direto: @{username}". CC continua sendo o solicitante.

**Conteúdo do e-mail (corpo):**
- Solicitante, número do voucher, tipo de documento, valor, motivo da urgência.
- Dois botões: **Aprovar** e **Rejeitar** (mesmo fluxo `supervisor-email-action` já em produção, com `Reply-To` apontando para o solicitante).

**Resposta automática ao solicitante (mantém comportamento já testado):**
Após o supervisor clicar Aprovar/Rejeitar pelo link:
- `supervisor-email-action` continua disparando os e-mails de confirmação `URGENCIA_APROVADA` / `URGENCIA_REJEITADA` para o solicitante (com motivo no caso de rejeição).
- Esses dois branches **permanecem** em `send-voucher-notification` (não serão removidos como no plano anterior). Destinatário: criador do voucher; CC: supervisor que aprovou/rejeitou.

**Tipo novo:** `URGENCIA_SOLICITADA` em `send-voucher-notification` substitui o disparo atual de `VOUCHER_ENVIADO` quando há urgência manual. Disparado de `CreateVoucherDialog.tsx` e `VoucherOperacaoActions.tsx`.

---

### Alerta 3 — Relatório mensal de processados

**Quando:** cron `pg_cron`, último dia do mês 18h (BRT).

**Para quem:** todos `SUPERVISOR`, `GESTOR_SUPERVISOR`, `FINANCEIRO`, `GESTOR_FINANCEIRO`, `ADMIN` ativos em `t_users_dachser`.

**Conteúdo:** vouchers `CONCLUIDO` no mês, total por filial, total geral, link.

**Implementação:** mantém `voucher-monthly-report`, troca destinatários e remove overrides hardcoded (ex.: `larissa@z3us.ai`).

---

### Remoções

| Item | Ação |
|---|---|
| Edge function `voucher-check-sla-alerts` | apagar + remover cron |
| Edge function `voucher-send-daily-report` | apagar + remover cron |
| Edge function `voucher-notify-rm-pending` | apagar + remover cron |
| Branches `VOUCHER_ENVIADO`, `VOUCHER_CONCLUIDO`, `VENCIMENTO_PROXIMO` em `send-voucher-notification` | apagar |
| **Manter** branches `URGENCIA_APROVADA` e `URGENCIA_REJEITADA` (resposta ao solicitante) | manter |
| Chamadas `send-voucher-notification` em `CreateVoucherDialog.tsx` e `VoucherOperacaoActions.tsx` para avanço normal de etapa | apagar |
| `supervisor-email-action/index.ts`: remover apenas o fetch `VOUCHER_ENVIADO`, manter os 2 fetches `URGENCIA_APROVADA`/`URGENCIA_REJEITADA` | ajustar |
| `src/utils/esteiraNotifications.ts` | remover se nenhum consumidor restar |

---

### Validação pós-deploy

1. OPERAÇÃO → FISCAL normal: nenhum e-mail.
2. FISCAL devolve para AJUSTE_OPERACAO com motivo: criador recebe 1 e-mail com motivo.
3. Criar voucher tipo "FRETE" + "Pagamento Urgente": supervisor direto recebe e-mail (TO), criador em CC.
4. Criar voucher urgente sem supervisor cadastrado: todos supervisores em TO + criador em CC, com aviso de fallback.
5. Criar voucher tipo "ICMS" sem urgência manual: nenhum e-mail.
6. Supervisor clica "Aprovar" no link: criador recebe `URGENCIA_APROVADA`, supervisor em CC.
7. Supervisor clica "Rejeitar" e informa motivo: criador recebe `URGENCIA_REJEITADA` com motivo.
8. Invocar manualmente `voucher-monthly-report`: supervisores + financeiro + admin recebem.

---

### Não muda

Schema de vouchers, fluxo de etapas, regras `URGENTE_REAL` vs `URGENTE_AUTOMATICO`, `MANUAL_OVERRIDES`, fluxo externo de aprovação por e-mail (`supervisor-email-action` + páginas hospedadas), `t_users_dachser.supervisor_id`.

### Memória a atualizar

`mem://vouchers/reporting-and-notification-strategy-v2`: 3 alertas — (1) devolução com motivo, (2) urgência manual: TO supervisor direto + CC solicitante, com resposta automática (`URGENCIA_APROVADA`/`URGENCIA_REJEITADA`) ao solicitante após ação no link, (3) relatório mensal. SLA diário, daily report e RM-pending descontinuados.

