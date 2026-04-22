

## Plano — Sair do modo de teste nos alertas da Esteira

### Diagnóstico

Após inspecionar as 3 funções dos alertas (`send-voucher-notification`, `voucher-monthly-report`, `supervisor-email-action`), confirmei: **não há nenhum `larissa@z3us.ai` hardcoded**. A refatoração anterior já tirou o override de teste. Os destinatários atuais são todos resolvidos dinamicamente pelo banco.

| Alerta | Destinatário em produção | Status |
|---|---|---|
| 1 — Ajuste solicitado | Criador do voucher (AJUSTE_OPERACAO) ou último Fiscal (AJUSTE_FISCAL), via `get_voucher_responsaveis_emails` | ✅ Já correto |
| 2 — Urgência (TO supervisor direto + CC solicitante) | `t_users_dachser.supervisor_id` do solicitante | ✅ Já correto |
| 2b — Resposta automática aprovada/rejeitada (TO solicitante + CC supervisor) | Solicitante original | ✅ Já correto |
| 3 — Relatório mensal completo | Roles `SUPERVISOR`, `GESTOR_SUPERVISOR`, `FINANCEIRO`, `GESTOR_FINANCEIRO`, `ADMIN` ativos em `t_users_dachser` | ✅ Já correto |
| 3b — Relatório mensal segmentado (Fiscal/Operação/Supervisor/Financeiro) | Roles correspondentes em `t_users_dachser` + `SEGMENT_EXTRA_EMAILS` (Marta, Cleiciane, Luciana) | ✅ Mantido conforme decisão |

### O que vai mudar no código

**Nada.** Como decidimos manter Marta, Cleiciane e Luciana hardcoded (elas não têm login na Esteira), e o resto já está em produção sem override de teste, **não há código a alterar**.

### Ações operacionais (sem código)

1. **Remover crons antigos** no Cron Manager (`/admin/cron`):
   - `voucher-check-sla-alerts`
   - `voucher-send-daily-report`
   - `voucher-notify-rm-pending`
2. **Confirmar que existem 3 crons ativos** correspondentes aos novos alertas:
   - Disparo do relatório mensal (`voucher-monthly-report`) — 1º dia do mês.
   - (Alertas 1 e 2 são event-driven, não precisam de cron.)
3. **Validação ponta-a-ponta**:
   - Devolver um voucher para ajuste → conferir que apenas o criador/último fiscal recebeu.
   - Marcar urgência num voucher → conferir que apenas o supervisor direto recebeu (com solicitante em CC), aprovar pelo botão e conferir resposta automática.
   - Disparar `voucher-monthly-report` manualmente **sem** `testEmail` → conferir nos logs que destinatários vêm de `t_users_dachser` + extras nos segmentados.

### Memória a atualizar

`mem://vouchers/reporting-and-notification-strategy-v2`: registrar que `larissa@z3us.ai` foi removida de todos os fluxos da Esteira; manter nota de que `SEGMENT_EXTRA_EMAILS` (Marta/Cleiciane/Luciana) é intencionalmente hardcoded por não terem login na Esteira.

