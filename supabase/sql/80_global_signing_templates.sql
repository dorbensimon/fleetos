-- Signing templates are now created only directly in DocuSeal (inside the
-- "FleetOS-Global" folder) and shared by every company. company_id = null
-- marks a template as global; every company reads it, only the platform
-- owner may archive or delete it, and no company may create one.

alter table public.signing_templates
  alter column company_id drop not null;

drop policy if exists "read permitted signing templates" on public.signing_templates;
create policy "read permitted signing templates" on public.signing_templates
for select
using (
  private.can_manage_company(company_id)
  or (
    company_id is null
    and private.current_role_name() = 'admin'
    and private.current_company_is_active()
  )
  or (
    private.current_company_is_active()
    and status = 'ready'
    and exists (
      select 1
      from public.signature_requests request
      where request.template_id = signing_templates.id
        and request.driver_id = (select auth.uid())
    )
  )
);

-- Global templates' source PDFs live under a reserved sentinel "company id"
-- folder (00000000-0000-0000-0000-000000000000), since storage policies cast
-- the first path segment to uuid. Let any active admin/owner read that folder.
drop policy if exists "read global signing template documents in storage" on storage.objects;
create policy "read global signing template documents in storage" on storage.objects
for select
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = '00000000-0000-0000-0000-000000000000'
  and private.current_role_name() = any(array['admin', 'owner'])
  and (
    private.current_role_name() = 'owner'
    or private.current_company_is_active()
  )
);

-- Deletes a global template and detaches/removes its signature_requests
-- across every company that used it (mirrors delete_signing_template_records,
-- which stays in place for any legacy company-scoped template row).
create or replace function public.delete_global_signing_template_records(
  target_template_id uuid,
  template_title_snapshot text
)
returns boolean
language plpgsql
set search_path to ''
as $$
begin
  if not exists (
    select 1
    from public.signing_templates template
    where template.id = target_template_id
      and template.company_id is null
  ) then
    return false;
  end if;

  -- Signed requests survive the template, across every company that used it.
  update public.signature_requests
  set template_title = template_title_snapshot
  where template_id = target_template_id
    and status = 'completed';

  delete from public.signature_requests
  where template_id = target_template_id
    and status <> 'completed';

  delete from public.signing_templates
  where id = target_template_id
    and company_id is null;

  return true;
end;
$$;

revoke all on function public.delete_global_signing_template_records(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_global_signing_template_records(uuid, text) to service_role;

-- private.enforce_signing_record_integrity() (defined in 49_signing_access_hardening.sql)
-- rejected every signature_requests insert/update against a global template,
-- since it required template_company_id = new.company_id with no NULL
-- exception — NULL is distinct from any real company id. It also silently
-- skipped the signing_templates source_file_path check for a global row
-- (string concatenation with a NULL company_id yields NULL, and `if NULL`
-- never fires), so replace it with a version that treats company_id is null
-- as "global" for both checks.
create or replace function private.enforce_signing_record_integrity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  template_company_id uuid;
  driver_company_id uuid;
  driver_role text;
  global_sentinel uuid := '00000000-0000-0000-0000-000000000000';
begin
  if tg_table_name = 'signing_templates' then
    if new.source_file_path !~ ('^' || coalesce(new.company_id, global_sentinel)::text || '/signing-templates/[^/]+/[^/]+[.]pdf$') then
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

  if new.template_id is not null then
    select company_id into template_company_id
    from public.signing_templates
    where id = new.template_id;

    -- A global template (template_company_id is null) is shared by every
    -- company, so a request against it may belong to any company.
    if template_company_id is not null and template_company_id is distinct from new.company_id then
      raise exception 'בקשת חתימה חייבת להשתייך לתבנית מאותה חברה';
    end if;
  end if;

  select company_id, role into driver_company_id, driver_role
  from public.profiles
  where id = new.driver_id;

  if driver_company_id is distinct from new.company_id
     or driver_role is distinct from 'driver' then
    raise exception 'בקשת חתימה חייבת להשתייך לנהג מאותה חברה';
  end if;

  if new.signed_file_path is not null
     and new.signed_file_path <> format('%s/driver/%s/signed/%s.pdf', new.company_id, new.driver_id, new.id) then
    raise exception 'נתיב המסמך החתום אינו תקין';
  end if;

  if tg_op = 'UPDATE' and (
    new.company_id is distinct from old.company_id
    or new.driver_id is distinct from old.driver_id
    or new.created_by is distinct from old.created_by
    or (new.template_id is distinct from old.template_id and new.template_id is not null)
  ) then
    raise exception 'אין לשנות את הבעלות על בקשת חתימה';
  end if;

  return new;
end;
$$;
