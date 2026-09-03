-- Email-only signing reminders.  No phone number or SMS channel is stored or
-- used anywhere in this workflow.

create extension if not exists pg_net with schema extensions;

create table if not exists public.company_signing_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  email_reminders_enabled boolean not null default true,
  initial_reminder_delay_hours smallint not null default 72,
  repeat_reminder_interval_hours smallint not null default 72,
  max_email_reminders smallint not null default 3,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_signing_settings_initial_delay_check
    check (initial_reminder_delay_hours between 1 and 720),
  constraint company_signing_settings_repeat_interval_check
    check (repeat_reminder_interval_hours between 1 and 720),
  constraint company_signing_settings_max_reminders_check
    check (max_email_reminders between 0 and 10)
);

alter table public.company_signing_settings enable row level security;

-- Settings are displayed inside the company signing area. Writes remain in a
-- verified Edge Function, just like all other signing-record writes.
drop policy if exists "read permitted company signing settings" on public.company_signing_settings;
create policy "read permitted company signing settings"
  on public.company_signing_settings for select to authenticated
  using ((select private.can_manage_company(company_id)));

revoke all on public.company_signing_settings from anon, authenticated;
grant select on public.company_signing_settings to authenticated;
grant select, insert, update, delete on public.company_signing_settings to service_role;

drop trigger if exists company_signing_settings_touch on public.company_signing_settings;
create trigger company_signing_settings_touch before update on public.company_signing_settings
  for each row execute function public.touch_updated_at();

alter table public.signature_requests
  add column if not exists email_reminder_count smallint not null default 0,
  add column if not exists last_email_reminder_at timestamptz,
  add column if not exists next_email_reminder_at timestamptz,
  add column if not exists email_reminder_locked_until timestamptz;

alter table public.signature_requests
  add constraint signature_requests_email_reminder_count_check
  check (email_reminder_count between 0 and 10) not valid;

alter table public.signature_requests
  validate constraint signature_requests_email_reminder_count_check;

-- The worker only examines active pending requests that actually have a
-- scheduled reminder, so this stays small even as signing history grows.
create index if not exists signature_requests_due_email_reminder_idx
  on public.signature_requests(next_email_reminder_at)
  where status = 'pending'
    and archived_at is null
    and next_email_reminder_at is not null;

-- The cron job gets a random authorization value from Supabase Vault. It is
-- generated inside the database so it never appears in source code or logs.
-- The Edge Function validates the submitted value through the server-only RPC
-- below; it does not need a duplicate Edge Function environment variable.
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'signing_reminder_cron_secret'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'signing_reminder_cron_secret'
);

-- This public RPC is callable only by the service role used inside the Edge
-- Function. Browser clients cannot use it to test or retrieve the Vault value.
create or replace function public.validate_signing_reminder_cron_secret(candidate text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_secret text;
begin
  select decrypted_secret into expected_secret
  from vault.decrypted_secrets
  where name = 'signing_reminder_cron_secret';

  return candidate is not null
    and expected_secret is not null
    and encode(extensions.digest(convert_to(candidate, 'UTF8'), 'sha256'), 'hex')
      = encode(extensions.digest(convert_to(expected_secret, 'UTF8'), 'sha256'), 'hex');
end;
$$;

revoke execute on function public.validate_signing_reminder_cron_secret(text)
  from public, anon, authenticated;
grant execute on function public.validate_signing_reminder_cron_secret(text) to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'fleetos-process-signing-email-reminders';

select cron.schedule(
  'fleetos-process-signing-email-reminders',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/process-signing-email-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'x-signing-reminder-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'signing_reminder_cron_secret')
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 10000
    );
  $cron$
);
