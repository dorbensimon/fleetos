-- Prevent disabled-company administrators from continuing to manage tenant
-- data through direct Data API calls. Edge Functions already reject disabled
-- companies, but RLS used private.can_manage_company(), whose admin branch did
-- not check company status.

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
      and private.current_company_is_active()
    )
$$;

revoke all on function private.can_manage_company(uuid) from public, anon;
grant execute on function private.can_manage_company(uuid) to authenticated, service_role;

-- Drivers may read their assignment history and company departments only while
-- their company is active. Owners and active admins retain management access.
drop policy if exists "authenticated select access" on public.vehicle_driver_history;
create policy "authenticated select access"
  on public.vehicle_driver_history for select to authenticated
  using (
    private.can_manage_company(company_id)
    or (
      driver_id = (select auth.uid())
      and private.current_company_is_active()
    )
  );

drop policy if exists "authenticated select access" on public.departments;
create policy "authenticated select access"
  on public.departments for select to authenticated
  using (
    private.can_manage_company(company_id)
    or (
      company_id = private.current_company_id()
      and private.current_company_is_active()
    )
  );
