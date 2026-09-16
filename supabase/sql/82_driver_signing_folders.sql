-- Deployment draft: apply only with production approval. Existing unsigned
-- requests intentionally keep NULL deadlines until provider reconciliation.
begin;
alter table public.signature_requests
  add column if not exists sent_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists expiry_locked_until timestamptz;

alter table public.signing_templates
  add column if not exists rename_locked_until timestamptz;

alter table public.notifications
  add column if not exists signature_request_id uuid references public.signature_requests(id) on delete cascade;
create index if not exists notifications_signature_request_idx
  on public.notifications(signature_request_id) where signature_request_id is not null;
create index if not exists signature_requests_expiry_idx
  on public.signature_requests(expires_at)
  where status <> 'completed' and expires_at is not null;

-- Preserve the historical title once; later template renames never rewrite it.
update public.signature_requests r set template_title = t.title
from public.signing_templates t where r.template_id = t.id and r.template_title is null;

drop policy if exists "read permitted signing templates" on public.signing_templates;
create policy "read permitted signing templates" on public.signing_templates
for select to authenticated using (
  private.current_role_name() = 'owner'
  or private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and (company_id is null or company_id = private.current_company_id())
    and status = 'ready'
    and archived_at is null
  )
  or (
    private.current_company_is_active()
    and exists (select 1 from public.signature_requests r
      where r.template_id = signing_templates.id and r.driver_id = (select auth.uid()))
  )
);
-- No new client write grants. All mutations use verified Edge Functions.
commit;
