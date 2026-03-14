

## Plano: Alterar cron do alerta de falha de rastreio para 10 em 10 minutos

### Situação atual
O cron job `air-tracking-failed-alert` (jobid: 22) está configurado para rodar a cada **30 minutos** (`*/30 * * * *`).

### Alteração
Atualizar o schedule do cron job existente para rodar a cada **10 minutos** (`*/10 * * * *`).

Será executado via SQL:
```sql
SELECT cron.alter_job(22, schedule := '*/10 * * * *');
```

Uma única query, sem alteração de código.

