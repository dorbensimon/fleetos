-- Preserve signing evidence: records are archived instead of being deleted.
alter table public.signing_templates
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.signature_requests
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists failed_at timestamptz,
  add column if not exists failure_reason text;

alter table public.signature_requests
  drop constraint if exists signature_requests_status_check;

alter table public.signature_requests
  add constraint signature_requests_status_check
  check (status in ('pending', 'completed', 'declined', 'cancelled', 'failed'));

-- A pending request without its DocuSeal submitter cannot be opened or signed.
-- Keep it as audit history, but do not let it block a fresh delivery.
update public.signature_requests
set status = 'failed',
    failed_at = coalesce(failed_at, now()),
    failure_reason = coalesce(failure_reason, 'No signing-provider task was created')
where status = 'pending'
  and docuseal_submitter_id is null;

create index if not exists signing_templates_company_active_idx
  on public.signing_templates(company_id, created_at desc)
  where archived_at is null;

create index if not exists signature_requests_company_active_idx
  on public.signature_requests(company_id, created_at desc)
  where archived_at is null;

create index if not exists signature_requests_pending_template_driver_idx
  on public.signature_requests(template_id, driver_id)
  where status = 'pending' and archived_at is null;
