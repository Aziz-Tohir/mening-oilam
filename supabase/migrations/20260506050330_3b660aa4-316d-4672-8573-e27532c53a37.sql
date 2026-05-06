
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule if exists
DO $$
BEGIN
  PERFORM cron.unschedule('process-join-requests');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'process-join-requests',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mening-oilam.lovable.app/api/public/cron/process-join-requests?secret=' ||
           (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
