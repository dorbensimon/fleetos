-- Follow-up hardening for temporary-password accounts.
-- Local only until explicitly approved for production.

-- Managers using a temporary password are not company managers yet. Owner is
-- the platform super-admin and remains the only role that may manage admins.
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
      and not private.current_user_pending_password_setup()
      and private.current_company_id() = target_company
      and private.current_company_is_active()
    )
$$;

revoke all on function private.can_manage_company(uuid) from public, anon;
grant execute on function private.can_manage_company(uuid) to authenticated, service_role;

-- The user's own profile remains readable so the app can route them to the
-- password screen, but it cannot be edited while setup is pending.
drop policy if exists "authenticated select access" on public.profiles;
create policy "authenticated select access" on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or private.current_role_name() = 'owner'
  or (
    private.current_role_name() = 'admin'
    and not private.current_user_pending_password_setup()
    and private.current_company_is_active()
    and company_id = private.current_company_id()
  )
);

drop policy if exists "authenticated update access" on public.profiles;
create policy "authenticated update access" on public.profiles
for update to authenticated
using (
  private.can_manage_company(company_id)
  or (
    id = (select auth.uid())
    and private.current_company_is_active()
    and not private.current_user_pending_password_setup()
  )
)
with check (
  private.can_manage_company(company_id)
  or (
    id = (select auth.uid())
    and private.current_company_is_active()
    and not private.current_user_pending_password_setup()
  )
);

drop policy if exists "authenticated select access" on public.companies;
create policy "authenticated select access" on public.companies
for select to authenticated
using (
  private.current_role_name() = 'owner'
  or (
    id = private.current_company_id()
    and not private.current_user_pending_password_setup()
  )
);

-- Close the remaining driver read branches omitted by migration 72.
drop policy if exists "authenticated select access" on public.vehicle_drivers;
create policy "authenticated select access" on public.vehicle_drivers
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    driver_id = (select auth.uid())
    and private.current_company_is_active()
    and not private.current_user_pending_password_setup()
  )
);

drop policy if exists "authenticated select access" on public.vehicles;
create policy "authenticated select access" on public.vehicles
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and not private.current_user_pending_password_setup()
    and exists (
      select 1 from public.vehicle_drivers assignment
      where assignment.vehicle_id = vehicles.id
        and assignment.driver_id = (select auth.uid())
        and assignment.unassigned_at is null
    )
  )
);

drop policy if exists "authenticated select access" on public.compliance_items;
create policy "authenticated select access" on public.compliance_items
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and not private.current_user_pending_password_setup()
    and (
      (
        owner_type = 'driver'
        and owner_id = (select auth.uid())
        and not private.current_driver_is_archived()
      )
      or (
        owner_type = 'vehicle'
        and exists (
          select 1 from public.vehicle_drivers assignment
          where assignment.vehicle_id = compliance_items.owner_id
            and assignment.driver_id = (select auth.uid())
            and assignment.unassigned_at is null
        )
      )
    )
  )
);

drop policy if exists "authenticated select access" on public.vehicle_driver_history;
create policy "authenticated select access" on public.vehicle_driver_history
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    driver_id = (select auth.uid())
    and private.current_company_is_active()
    and not private.current_user_pending_password_setup()
  )
);

drop policy if exists "authenticated select access" on public.departments;
create policy "authenticated select access" on public.departments
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    company_id = private.current_company_id()
    and private.current_company_is_active()
    and not private.current_user_pending_password_setup()
  )
);

drop policy if exists "read permitted signing templates" on public.signing_templates;
create policy "read permitted signing templates" on public.signing_templates
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and not private.current_user_pending_password_setup()
    and status = 'ready'
    and exists (
      select 1 from public.signature_requests request
      where request.template_id = signing_templates.id
        and request.driver_id = (select auth.uid())
    )
  )
);

-- Compare a candidate password with GoTrue's bcrypt hash without creating a
-- login session. The client roles cannot execute this function.
create or replace function public.auth_password_matches(
  target_user_id uuid,
  candidate_password text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select users.encrypted_password = extensions.crypt(candidate_password, users.encrypted_password)
      from auth.users
      where users.id = target_user_id
    ),
    false
  )
$$;

revoke all on function public.auth_password_matches(uuid, text) from public, anon, authenticated;
grant execute on function public.auth_password_matches(uuid, text) to service_role;
