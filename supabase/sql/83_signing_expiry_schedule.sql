-- Separate rollout step, after function deployment and approval.
-- Starts in READ-ONLY audit mode. No request is removed by this schedule.
select cron.schedule(
  'fleetos-process-signing-expiry',
  '* * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/process-signing-expiry',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'x-signing-reminder-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'signing_reminder_cron_secret')
      ),
      body := '{"dryRun":true}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
