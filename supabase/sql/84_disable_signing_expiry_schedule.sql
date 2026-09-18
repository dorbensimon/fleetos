-- Signing requests remain pending until they are signed, archived, or explicitly cancelled.
-- Keep the expiry worker deployed for a future opt-in, but stop its scheduled invocations.
select cron.unschedule(jobid)
from cron.job
where jobname = 'fleetos-process-signing-expiry';
