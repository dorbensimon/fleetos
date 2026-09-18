-- Signature requests are delivered and signed only inside FleetOS.
-- Cancel the email reminder worker and clear any pending reminder timestamps.
select cron.unschedule(jobid)
from cron.job
where jobname = 'fleetos-process-signing-email-reminders';

update public.signature_requests
set next_email_reminder_at = null,
    email_reminder_locked_until = null
where next_email_reminder_at is not null
   or email_reminder_locked_until is not null;
