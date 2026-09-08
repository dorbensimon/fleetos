-- ============================================================
-- 65_archived_driver_rls_lockout.sql
--
-- Closes a gap in the driver-archive feature (64): every RLS policy that
-- lets a driver read/write their own rows checked "is the company active",
-- never "is this driver themself archived". Auth ban + session revocation
-- block a *new* login or token refresh, but an access token issued before
-- the archive stays valid until it naturally expires (commonly up to an
-- hour) — and for that whole window RLS let it through untouched. Worse,
-- driver_details' own update policy let an archived driver flip their own
-- status back to 'active' with a direct API call, silently undoing the
-- archive and erasing archived_at/archived_by.
--
-- This adds one helper — private.current_driver_is_archived() — and folds
-- "not private.current_driver_is_archived()" into every policy branch that
-- grants a driver access to their own rows. For a caller who isn't a
-- driver at all (admin/owner), the underlying driver_details lookup finds
-- no row and the check is a no-op.
-- ============================================================

create or replace function private.current_driver_is_archived()
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.driver_details details
    where details.id = (select auth.uid())
      and details.status = 'archived'
  )
$$;


-- ---- driver_details: an archived driver can no longer read or edit their own row, or self-restore ----

drop policy if exists "authenticated select access" on public.driver_details;
create policy "authenticated select access" on public.driver_details
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    id = (select auth.uid())
    and private.current_company_is_active()
    and status <> 'archived'
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
  )
)
with check (
  private.can_manage_company(company_id)
  or (
    id = (select auth.uid())
    and private.current_company_is_active()
    and status <> 'archived'
  )
);


-- ---- documents: an archived driver can no longer read/write/delete their own documents ----

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
  )
);


-- ---- compliance_items: only the driver-owned branch needs the check; the
-- vehicle branch already requires an active (unassigned_at is null)
-- assignment, which archiving already closes atomically. ----

drop policy if exists "authenticated select access" on public.compliance_items;
create policy "authenticated select access" on public.compliance_items
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and (
      (owner_type = 'driver' and owner_id = (select auth.uid()) and not private.current_driver_is_archived())
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


-- ---- signature_requests: an archived driver can no longer read their own signing requests ----

drop policy if exists "read permitted signature requests" on public.signature_requests;
create policy "read permitted signature requests" on public.signature_requests
for select to authenticated
using (
  private.can_manage_company(company_id)
  or (
    driver_id = (select auth.uid())
    and private.current_company_is_active()
    and not private.current_driver_is_archived()
  )
);


-- ---- notifications: an archived driver can no longer see/mark/delete their own notifications ----

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
  )
  or (recipient_id is null and (select private.can_manage_company(notifications.company_id)))
);


-- ---- notification_preferences: an archived driver can no longer read/edit their own preferences ----

drop policy if exists "user manages own notification_preferences" on public.notification_preferences;
create policy "user manages own notification_preferences" on public.notification_preferences
for all to authenticated
using (
  user_id = (select auth.uid())
  and (private.current_role_name() = 'owner' or private.current_company_is_active())
  and not private.current_driver_is_archived()
)
with check (
  user_id = (select auth.uid())
  and (private.current_role_name() = 'owner' or private.current_company_is_active())
  and not private.current_driver_is_archived()
);
