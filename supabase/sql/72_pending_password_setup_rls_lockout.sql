-- ============================================================
-- 72_pending_password_setup_rls_lockout.sql
--
-- must_change_password (profiles) marks an account whose access token is
-- already fully valid but which hasn't confirmed a real password yet — the
-- admin-assigned temporary password is still the live credential. None of
-- the RLS policies granting a driver access to their own rows checked this,
-- mirroring exactly the gap 65_archived_driver_rls_lockout.sql closed for
-- archived drivers: a token issued (or still valid) before setup completes
-- could read/write the driver's documents, compliance items, signature
-- requests, and notifications before the account was ever secured with a
-- real password.
--
-- This adds private.current_user_pending_password_setup() and folds
-- "not private.current_user_pending_password_setup()" into the same
-- driver-self-access branches 65/66 already gate on driver-archival,
-- alongside the existing archived-driver check.
--
-- public.profiles is deliberately left untouched: resolveRouteForUser
-- (lib/session.ts) must still be able to read role/company_id/
-- must_change_password to route the user to SetPasswordScreen in the first
-- place, and the one action allowed before setup completes
-- (complete-password-setup) runs under the service role, which this check
-- does not restrict.
-- ============================================================

create or replace function private.current_user_pending_password_setup()
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(
    (select p.must_change_password from public.profiles p where p.id = (select auth.uid())),
    false
  )
$$;


-- ---- driver_details ----

drop policy if exists "authenticated select access" on public.driver_details;
create policy "authenticated select access" on public.driver_details
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    id = (select auth.uid())
    and private.current_company_is_active()
    and status <> 'archived'
    and not private.current_user_pending_password_setup()
  )
);

drop policy if exists "authenticated update access" on public.driver_details;
create policy "authenticated update access" on public.driver_details
for update to authenticated
using (
  private.can_manage_company(company_id)
  or (
    id = (select auth.uid())
    and private.current_company_is_active()
    and status <> 'archived'
    and not private.current_user_pending_password_setup()
  )
)
with check (
  private.can_manage_company(company_id)
  or (
    id = (select auth.uid())
    and private.current_company_is_active()
    and status <> 'archived'
    and not private.current_user_pending_password_setup()
  )
);


-- ---- documents ----

drop policy if exists "authenticated select access" on public.documents;
create policy "authenticated select access" on public.documents
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and owner_type = 'driver'
    and owner_id = (select auth.uid())
    and company_id = private.current_company_id()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
  )
);

drop policy if exists "authenticated insert access" on public.documents;
create policy "authenticated insert access" on public.documents
for insert to authenticated
with check (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and owner_type = 'driver'
    and owner_id = (select auth.uid())
    and company_id = private.current_company_id()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
    and (
      compliance_item_id is null
      or exists (
        select 1 from public.compliance_items item
        where item.id = documents.compliance_item_id
          and item.owner_type = 'driver'
          and item.owner_id = (select auth.uid())
          and item.company_id = private.current_company_id()
      )
    )
  )
);

drop policy if exists "authenticated update access" on public.documents;
create policy "authenticated update access" on public.documents
for update to authenticated
using (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and owner_type = 'driver'
    and owner_id = (select auth.uid())
    and company_id = private.current_company_id()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
  )
)
with check (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and owner_type = 'driver'
    and owner_id = (select auth.uid())
    and company_id = private.current_company_id()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
    and (
      compliance_item_id is null
      or exists (
        select 1 from public.compliance_items item
        where item.id = documents.compliance_item_id
          and item.owner_type = 'driver'
          and item.owner_id = (select auth.uid())
          and item.company_id = private.current_company_id()
      )
    )
  )
);

drop policy if exists "authenticated delete access" on public.documents;
create policy "authenticated delete access" on public.documents
for delete to authenticated
using (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and owner_type = 'driver'
    and owner_id = (select auth.uid())
    and company_id = private.current_company_id()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
  )
);


-- ---- compliance_items: only the driver-owned branch needs the check ----

drop policy if exists "authenticated select access" on public.compliance_items;
create policy "authenticated select access" on public.compliance_items
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and (
      (
        owner_type = 'driver'
        and owner_id = (select auth.uid())
        and not private.current_driver_is_archived()
        and not private.current_user_pending_password_setup()
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


-- ---- signature_requests ----

drop policy if exists "read permitted signature requests" on public.signature_requests;
create policy "read permitted signature requests" on public.signature_requests
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    driver_id = (select auth.uid())
    and private.current_company_is_active()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
  )
);


-- ---- notifications ----

drop policy if exists "users see relevant notifications" on public.notifications;
create policy "users see relevant notifications" on public.notifications
for select to authenticated
using (
  (
    (
      recipient_id = (select auth.uid())
      and company_id = private.current_company_id()
      and private.current_company_is_active()
      and not private.current_driver_is_archived()
      and not private.current_user_pending_password_setup()
    )
    or (recipient_id is null and (select private.can_manage_company(notifications.company_id)))
  )
  and (
    notification_type is null
    or not exists (
      select 1 from public.notification_preferences preference
      where preference.user_id = (select auth.uid())
        and preference.notification_type = notifications.notification_type
        and preference.enabled = false
    )
  )
);

drop policy if exists "users mark relevant notifications read" on public.notifications;
create policy "users mark relevant notifications read" on public.notifications
for update to authenticated
using (
  (
    recipient_id = (select auth.uid())
    and company_id = private.current_company_id()
    and private.current_company_is_active()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
  )
  or (recipient_id is null and (select private.can_manage_company(notifications.company_id)))
);

drop policy if exists "users delete relevant notifications" on public.notifications;
create policy "users delete relevant notifications" on public.notifications
for delete to authenticated
using (
  (
    recipient_id = (select auth.uid())
    and company_id = private.current_company_id()
    and private.current_company_is_active()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
  )
  or (recipient_id is null and (select private.can_manage_company(notifications.company_id)))
);


-- ---- notification_preferences ----

drop policy if exists "user manages own notification_preferences" on public.notification_preferences;
create policy "user manages own notification_preferences" on public.notification_preferences
for all to authenticated
using (
  user_id = (select auth.uid())
  and (private.current_role_name() = 'owner' or private.current_company_is_active())
  and not private.current_driver_is_archived()
  and not private.current_user_pending_password_setup()
)
with check (
  user_id = (select auth.uid())
  and (private.current_role_name() = 'owner' or private.current_company_is_active())
  and not private.current_driver_is_archived()
  and not private.current_user_pending_password_setup()
);


-- ---- storage.objects: driver's own document files ----

drop policy if exists "drivers read their own documents in storage" on storage.objects;
create policy "drivers read their own documents in storage"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and private.current_company_is_active()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
    and (storage.foldername(name))[1] = private.current_company_id()::text
    and (storage.foldername(name))[2] = 'driver'
    and (storage.foldername(name))[3] = (select auth.uid())::text
  );

drop policy if exists "drivers manage their own non-evidence documents in storage" on storage.objects;
create policy "drivers manage their own non-evidence documents in storage"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'documents'
    and private.current_company_is_active()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
    and (storage.foldername(name))[1] = private.current_company_id()::text
    and (storage.foldername(name))[2] = 'driver'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and coalesce((storage.foldername(name))[4], '') <> 'signed'
  )
  with check (
    bucket_id = 'documents'
    and private.current_company_is_active()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
    and (storage.foldername(name))[1] = private.current_company_id()::text
    and (storage.foldername(name))[2] = 'driver'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and coalesce((storage.foldername(name))[4], '') <> 'signed'
  );
