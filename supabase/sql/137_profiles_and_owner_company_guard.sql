-- 137: two gaps found in the 2026-11-03 Supabase security review.
--
-- 1. profiles: a company admin could DELETE or UPDATE any profile in their
--    company, other admins included. Deleting a profile cascades to
--    company_memberships and signature_requests, so it also removed another
--    manager's access to every company and wiped a driver's signed documents.
--    The Edge Functions already let an admin manage drivers only
--    (_shared/accountSecurity.ts mayManageAccount); RLS now says the same.
--    Deletes go through the Edge Functions (service role) or the owner.
--
-- 2. documents / compliance_items: the admin branch of the write policies
--    checked company_id but not owner_id, so an admin could write a row for
--    a vehicle or driver of another company. The notification triggers then
--    marked that company's expiry alerts as read. A trigger now checks that
--    the owner belongs to the row's company, the same way
--    private.schedule_same_company does for schedules (113).
--
-- Applied to production with Dor's approval on 2026-11-03, after a
-- rolled-back test run on production passed (admin can no longer delete or
-- edit another admin; cross-company document/compliance writes are refused).
-- 4 old demo documents already fail the check (3 of deleted drivers, 1 of an
-- admin); the trigger only runs on new writes, so they do not block anything.

-- 1. profiles -------------------------------------------------------------

drop policy if exists "authenticated delete access" on public.profiles;
create policy "authenticated delete access"
  on public.profiles for delete to authenticated
  using (private.current_role_name() = 'owner');

-- Same as 74, except the admin branch is limited to driver rows. An admin
-- still edits their own row through the second branch.
drop policy if exists "authenticated update access" on public.profiles;
create policy "authenticated update access" on public.profiles
for update to authenticated
using (
  private.current_role_name() = 'owner'
  or (private.can_manage_company(company_id) and role = 'driver')
  or (
    id = (select auth.uid())
    and private.current_company_is_active()
    and not private.current_user_pending_password_setup()
  )
)
with check (
  private.current_role_name() = 'owner'
  or (private.can_manage_company(company_id) and role = 'driver')
  or (
    id = (select auth.uid())
    and private.current_company_is_active()
    and not private.current_user_pending_password_setup()
  )
);

-- 2. owner belongs to the row's company ------------------------------------

create or replace function private.owner_same_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_type = 'vehicle' and not exists (
    select 1 from public.vehicles v where v.id = new.owner_id and v.company_id = new.company_id
  ) then
    raise exception 'vehicle_not_in_company' using errcode = 'P0001';
  end if;
  if new.owner_type = 'driver' and not exists (
    select 1 from public.driver_details d where d.id = new.owner_id and d.company_id = new.company_id
  ) then
    raise exception 'driver_not_in_company' using errcode = 'P0001';
  end if;
  if new.owner_type = 'company' and new.owner_id is distinct from new.company_id then
    raise exception 'company_owner_mismatch' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.owner_same_company() from public, anon, authenticated;

drop trigger if exists trg_documents_owner_same_company on public.documents;
create trigger trg_documents_owner_same_company
  before insert or update of company_id, owner_type, owner_id on public.documents
  for each row execute function private.owner_same_company();

drop trigger if exists trg_compliance_items_owner_same_company on public.compliance_items;
create trigger trg_compliance_items_owner_same_company
  before insert or update of company_id, owner_type, owner_id on public.compliance_items
  for each row execute function private.owner_same_company();

-- Before applying: rows that would fail the check today (should be none).
-- select 'documents' t, id from public.documents d
--  where (owner_type = 'vehicle' and not exists (select 1 from public.vehicles v where v.id = d.owner_id and v.company_id = d.company_id))
--     or (owner_type = 'driver'  and not exists (select 1 from public.driver_details x where x.id = d.owner_id and x.company_id = d.company_id))
--     or (owner_type = 'company' and owner_id is distinct from company_id)
-- union all
-- select 'compliance_items', id from public.compliance_items c
--  where (owner_type = 'vehicle' and not exists (select 1 from public.vehicles v where v.id = c.owner_id and v.company_id = c.company_id))
--     or (owner_type = 'driver'  and not exists (select 1 from public.driver_details x where x.id = c.owner_id and x.company_id = c.company_id));
