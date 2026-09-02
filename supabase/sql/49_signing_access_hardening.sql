-- Signature records are application evidence. Clients may read only the rows
-- they are entitled to see; every write is performed by a verified Edge Function.

-- Check first so no access policy is changed if historical duplicate links need
-- a manual decision. Never silently cancel signing evidence.
do $$
begin
  if exists (
    select 1
    from public.signature_requests
    where status = 'pending' and archived_at is null
    group by template_id, driver_id
    having count(*) > 1
  ) then
    raise exception 'יש בקשות חתימה כפולות ממתינות. יש לטפל בהן לפני הפעלת ההגנה.';
  end if;
end $$;

-- Migration 39 may have renamed these policies to "authenticated ... access".
drop policy if exists "insert own company signing templates" on public.signing_templates;
drop policy if exists "update own company signing templates" on public.signing_templates;
drop policy if exists "delete own company signing templates" on public.signing_templates;
drop policy if exists "insert own company signature requests" on public.signature_requests;
drop policy if exists "update own company signature requests" on public.signature_requests;
drop policy if exists "delete own company signature requests" on public.signature_requests;
drop policy if exists "authenticated insert access" on public.signing_templates;
drop policy if exists "authenticated update access" on public.signing_templates;
drop policy if exists "authenticated delete access" on public.signing_templates;
drop policy if exists "authenticated insert access" on public.signature_requests;
drop policy if exists "authenticated update access" on public.signature_requests;
drop policy if exists "authenticated delete access" on public.signature_requests;

revoke insert, update, delete on public.signing_templates from anon, authenticated;
revoke insert, update, delete on public.signature_requests from anon, authenticated;
grant select on public.signing_templates, public.signature_requests to authenticated;
grant select, insert, update, delete on public.signing_templates, public.signature_requests to service_role;

-- The existing client-read policies are kept explicitly so a prior migration
-- cannot leave an overly broad consolidated select policy behind.
drop policy if exists "read permitted signing templates" on public.signing_templates;
drop policy if exists "authenticated select access" on public.signing_templates;
create policy "read permitted signing templates"
  on public.signing_templates for select to authenticated
  using (
    (select private.can_manage_company(company_id))
    or (
      status = 'ready'
      and exists (
        select 1 from public.signature_requests request
        where request.template_id = signing_templates.id
          and request.driver_id = (select auth.uid())
      )
    )
  );

drop policy if exists "read permitted signature requests" on public.signature_requests;
drop policy if exists "authenticated select access" on public.signature_requests;
create policy "read permitted signature requests"
  on public.signature_requests for select to authenticated
  using (
    (select private.can_manage_company(company_id))
    or driver_id = (select auth.uid())
  );

-- Prevent duplicate outstanding signing links for the same template and driver.
drop index if exists public.signature_requests_pending_template_driver_idx;
create unique index if not exists signature_requests_pending_template_driver_unique_idx
  on public.signature_requests(template_id, driver_id)
  where status = 'pending' and archived_at is null;

-- Keep service-role writes internally consistent even if a future endpoint regresses.
create or replace function private.enforce_signing_record_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  template_company_id uuid;
  driver_company_id uuid;
  driver_role text;
begin
  if tg_table_name = 'signing_templates' then
    if new.source_file_path !~ ('^' || new.company_id::text || '/signing-templates/[^/]+/[^/]+[.]pdf$') then
      raise exception 'נתיב קובץ המקור של התבנית אינו תקין';
    end if;
    if tg_op = 'UPDATE' and (
      new.company_id is distinct from old.company_id
      or new.created_by is distinct from old.created_by
      or new.source_file_path is distinct from old.source_file_path
    ) then
      raise exception 'אין לשנות את הבעלות או קובץ המקור של תבנית חתימה';
    end if;
    return new;
  end if;

  select company_id into template_company_id
  from public.signing_templates
  where id = new.template_id;
  select company_id, role into driver_company_id, driver_role
  from public.profiles
  where id = new.driver_id;
  if template_company_id is distinct from new.company_id
     or driver_company_id is distinct from new.company_id
     or driver_role is distinct from 'driver' then
    raise exception 'בקשת חתימה חייבת להשתייך לתבנית ולנהג מאותה חברה';
  end if;
  if new.signed_file_path is not null
     and new.signed_file_path <> format('%s/driver/%s/signed/%s.pdf', new.company_id, new.driver_id, new.id) then
    raise exception 'נתיב המסמך החתום אינו תקין';
  end if;
  if tg_op = 'UPDATE' and (
    new.company_id is distinct from old.company_id
    or new.template_id is distinct from old.template_id
    or new.driver_id is distinct from old.driver_id
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'אין לשנות את הבעלות על בקשת חתימה';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_signing_template_integrity on public.signing_templates;
create trigger trg_enforce_signing_template_integrity
  before insert or update on public.signing_templates
  for each row execute function private.enforce_signing_record_integrity();

drop trigger if exists trg_enforce_signature_request_integrity on public.signature_requests;
create trigger trg_enforce_signature_request_integrity
  before insert or update on public.signature_requests
  for each row execute function private.enforce_signing_record_integrity();

revoke execute on function private.enforce_signing_record_integrity() from public, anon, authenticated;

-- A disabled company blocks admins and drivers immediately, even if they
-- already hold a valid access token. The platform owner keeps governance
-- access in order to reactivate or clean up a disabled company.
create or replace function private.can_manage_company(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_role_name() = 'owner'
    or (
      private.current_role_name() = 'admin'
      and private.current_company_id() = target_company
      and exists (
        select 1
        from public.companies company
        where company.id = target_company
          and company.status = 'active'
      )
    )
$$;
