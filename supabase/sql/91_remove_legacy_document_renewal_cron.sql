-- The nightly renewal-reminder job belongs to the retired in-house signing
-- attempt (driver_document_sends, 26.08). The table has no rows and nothing
-- writes to it; signing now runs through DocuSeal (signature_requests).
-- The legacy tables themselves are left in place for now.
select cron.unschedule(jobid)
from cron.job
where jobname = 'check-driver-document-renewal-reminders';

drop function if exists public.check_driver_document_renewal_reminders();
