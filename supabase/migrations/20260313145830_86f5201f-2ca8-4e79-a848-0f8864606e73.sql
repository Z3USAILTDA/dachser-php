SELECT cron.schedule(
  'air-dep-transition-alert',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://finktakbjcfmurqeiubz.supabase.co/functions/v1/air-dep-transition-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);