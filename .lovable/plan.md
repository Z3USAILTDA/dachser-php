## Ajuste de frequência dos crons

Vou alterar a frequência dos cron jobs no `cron.schedule` (pg_cron) reduzindo a pressão sobre o MariaDB:

| Job | Antes | Depois |
|---|---|---|
| `sync-voucher-statuses` | `*/5 * * * *` (5 min) | `*/10 * * * *` (10 min) |
| `sea-analysis-watchdog-check` | `*/5 * * * *` (5 min) | `5-59/10 * * * *` (10 min, offset 5) |
| `air-tracking-failed-alert` | `*/10 * * * *` (10 min) | `*/30 * * * *` (30 min) |

**Por que offset no `sea-analysis-watchdog-check`:** se ambos rodassem em `*/10 * * * *`, disparariam exatamente no mesmo segundo (00, 10, 20...) — exatamente o pico que está estourando hoje. Com offset de 5, rodam alternados (00→sync, 05→watchdog, 10→sync, 15→watchdog…).

## Implementação

Uma única operação SQL via insert (não migração — contém referências dependentes de ambiente do pg_cron):

```sql
SELECT cron.unschedule('sync-voucher-statuses');
SELECT cron.unschedule('sea-analysis-watchdog-check');
SELECT cron.unschedule('air-tracking-failed-alert');

SELECT cron.schedule('sync-voucher-statuses', '*/10 * * * *', $$ ... $$);
SELECT cron.schedule('sea-analysis-watchdog-check', '5-59/10 * * * *', $$ ... $$);
SELECT cron.schedule('air-tracking-failed-alert', '*/30 * * * *', $$ ... $$);
```

Vou recuperar o `command` atual de cada job antes de re-agendar para preservar o corpo do `net.http_post` exatamente como está hoje.

## Resultado esperado

- **−50%** de invocações de `sync-voucher-statuses` e `sea-analysis-watchdog-check` (de 12/h para 6/h cada).
- **−66%** de invocações de `air-tracking-failed-alert` (de 6/h para 2/h).
- Eliminação dos picos sincronizados em `:00`, `:05`, `:10`… que aparecem nos logs como sequência de erros `max_user_connections`.

## O que NÃO muda

- Demais crons (`db-status-report`, `db-critical-alert`, `firecrawl-monitor-alert`, `air-dep-transition-alert`, `air-scan-finalized`, `voucher-monthly-report`) ficam como estão.
- Nenhum código de edge function ou frontend é alterado nesta etapa.