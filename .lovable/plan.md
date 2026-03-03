

# Cron Job: firecrawl-monitor-alert a cada 30 minutos

## Ação

Criar um cron job via `pg_cron` + `pg_net` que chama a edge function `firecrawl-monitor-alert` a cada 30 minutos.

### SQL (via insert tool, não migration)

```sql
select cron.schedule(
  'firecrawl-monitor-alert-every-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url:='https://finktakbjcfmurqeiubz.supabase.co/functions/v1/firecrawl-monitor-alert',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpbmt0YWtiamNmbXVycWVpdWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjA2MjcsImV4cCI6MjA4MDQzNjYyN30.SqVlb4HtuPGbn6rRhZrTruR5JHf8XMSjVJfYxxPlT-s"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

A edge function já tem toda a lógica de:
- Verificar `TIMESTAMPDIFF` do `scraped_at` vs threshold de 120 min
- Deduplicação (não envia alerta repetido se já há um aberto)
- Envio de e-mail de recuperação quando normaliza

Nenhum arquivo precisa ser alterado — apenas executar o SQL acima.

