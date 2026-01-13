-- Habilitar extensão pg_cron se não existir
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Habilitar extensão pg_net para chamadas HTTP
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover job anterior se existir
SELECT cron.unschedule('anthropic-balance-check-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'anthropic-balance-check-daily'
);

-- Criar cron job para verificar saldo Anthropic diariamente às 9h (São Paulo = 12:00 UTC)
SELECT cron.schedule(
  'anthropic-balance-check-daily',
  '0 12 * * *', -- 12:00 UTC = 9:00 São Paulo
  $$
  SELECT net.http_post(
    url := 'https://finktakbjcfmurqeiubz.supabase.co/functions/v1/anthropic-balance-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpbmt0YWtiamNmbXVycWVpdWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjA2MjcsImV4cCI6MjA4MDQzNjYyN30.SqVlb4HtuPGbn6rRhZrTruR5JHf8XMSjVJfYxxPlT-s'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);