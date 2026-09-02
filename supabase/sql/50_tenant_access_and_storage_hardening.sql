-- Close cross-user profile visibility and revoke data/storage access as soon
-- as a company is disabled. This migration is intentionally local-only until
-- Dor explicitly approves applying it to the hosted project.

create or replace function private.current_company_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.companies company on company.id = profile.company_id
    where profile.id = (select auth.uid())
      and company.status = 'active'
  )
$$;

revoke execute on function private.current_company_is_active() from public, anon;
grant execute on function private.current_company_is_active() to authenticated, service_role;

-- A driver only needs their own profile. The previous catch-all company match
-- exposed every colleague's profile to every driver in the same company.
drop policy if exists "authenticated select access" on public.profiles;
create policy "authenticated select access"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or private.current_role_name() = 'owner'
    or (
      private.current_role_name() = 'admin'
      and private.current_company_is_active()
      and company_id = private.current_company_id()
    )
  );

drop policy if exists "authenticated insert access" on public.profiles;
create policy "authenticated insert access"
  on public.profiles for insert to authenticated
  with check (private.can_manage_company(company_id));

drop policy if exists "authenticated update access" on public.profiles;
create policy "authenticated update access"
  on public.profiles for update to authenticated
  using (
    private.can_manage_company(company_id)
    or (
      id = (select auth.uid())
      and private.current_company_is_active()
    )
  )
  with check (
    private.can_manage_company(company_id)
    or (
      id = (select auth.uid())
      and private.current_company_is_active()
    )
  );

drop policy if exists "authenticated delete access" on public.profiles;
create policy "authenticated delete access"
  on public.profiles for delete to authenticated
  using (private.can_manage_company(company_id));

drop policy if exists "authenticated select access" on public.driver_details;
create policy "authenticated select access"
  on public.driver_details for select to authenticated
  using (
    private.can_manage_company(company_id)
    or (id = (select auth.uid()) and private.current_company_is_active())
  );

drop policy if exists "authenticated update access" on public.driver_details;
create policy "authenticated update access"
  on public.driver_details for update to authenticated
  using (
    private.can_manage_company(company_id)
    or (id = (select auth.uid()) and private.current_company_is_active())
  )
  with check (
    private.can_manage_company(company_id)
    or (id = (select auth.uid()) and private.current_company_is_active())
  );

drop policy if exists "authenticated select access" on public.vehicle_drivers;
create policy "authenticated select access"
  on public.vehicle_drivers for select to authenticated
  using (
    private.can_manage_company(company_id)
    or (driver_id = (select auth.uid()) and private.current_company_is_active())
  );

drop policy if exists "authenticated select access" on public.vehicles;
create policy "authenticated select access"
  on public.vehicles for select to authenticated
  using (
    private.can_manage_company(company_id)
    or (
      private.current_company_is_active()
      and exists (
        select 1
        from public.vehicle_drivers assignment
        where assignment.vehicle_id = vehicles.id
          and assignment.driver_id = (select auth.uid())
          and assignment.unassigned_at is null
      )
    )
  );

drop policy if exists "authenticated select access" on public.compliance_items;
create policy "authenticated select access"
  on public.compliance_items for select to authenticated
  using (
    private.can_manage_company(company_id)
    or (
      private.current_company_is_active()
      and (
        (owner_type = 'driver' and owner_id = (select auth.uid()))
        or (
          owner_type = 'vehicle'
          and exists (
            select 1
            from public.vehicle_drivers assignment
            where assignment.vehicle_id = compliance_items.owner_id
              and assignment.driver_id = (select auth.uid())
              and assignment.unassigned_at is null
          )
        )
      )
    )
  );

drop policy if exists "authenticated select access" on public.documents;
create policy "authenticated select access"
  on public.documents for select to authenticated
  using (
    private.can_manage_company(company_id)
    or (
      private.current_company_is_active()
      and owner_type = 'driver'
      and owner_id = (select auth.uid())
      and company_id = private.current_company_id()
    )
  );

drop policy if exists "authenticated insert access" on public.documents;
create policy "authenticated insert access"
  on public.documents for insert to authenticated
  with check (
    private.can_manage_company(company_id)
    or (
      private.current_company_is_active()
      and owner_type = 'driver'
      and owner_id = (select auth.uid())
      and company_id = private.current_company_id()
      and (
        compliance_item_id is null
        or exists (
          select 1
          from public.compliance_items item
          where item.id = documents.compliance_item_id
            and item.owner_type = 'driver'
            and item.owner_id = (select auth.uid())
            and item.company_id = private.current_company_id()
        )
      )
    )
  );

drop policy if exists "authenticated update access" on public.documents;
create policy "authenticated update access"
  on public.documents for update to authenticated
  using (
    private.can_manage_company(company_id)
    or (
      private.current_company_is_active()
      and owner_type = 'driver'
      and owner_id = (select auth.uid())
      and company_id = private.current_company_id()
    )
  )
  with check (
    private.can_manage_company(company_id)
    or (
      private.current_company_is_active()
      and owner_type = 'driver'
      and owner_id = (select auth.uid())
      and company_id = private.current_company_id()
      and (
        compliance_item_id is null
        or exists (
          select 1
          from public.compliance_items item
          where item.id = documents.compliance_item_id
            and item.owner_type = 'driver'
            and item.owner_id = (select auth.uid())
            and item.company_id = private.current_company_id()
        )
      )
    )
  );

drop policy if exists "authenticated delete access" on public.documents;
create policy "authenticated delete access"
  on public.documents for delete to authenticated
  using (
    private.can_manage_company(company_id)
    or (
      private.current_company_is_active()
      and owner_type = 'driver'
      and owner_id = (select auth.uid())
      and company_id = private.current_company_id()
    )
  );

drop policy if exists "read permitted signature requests" on public.signature_requests;
create policy "read permitted signature requests"
  on public.signature_requests for select to authenticated
  using (
    private.can_manage_company(company_id)
    or (driver_id = (select auth.uid()) and private.current_company_is_active())
  );

drop policy if exists "read permitted signing templates" on public.signing_templates;
create policy "read permitted signing templates"
  on public.signing_templates for select to authenticated
  using (
    private.can_manage_company(company_id)
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

drop policy if exists "users see relevant notifications" on public.notifications;
create policy "users see relevant notifications"
  on public.notifications for select to authenticated
  using (
    (
      (
        recipient_id = (select auth.uid())
        and company_id = private.current_company_id()
        and private.current_company_is_active()
      )
      or (
        recipient_id is null
        and (select private.can_manage_company(company_id))
      )
    )
    and (
      notification_type is null
      or not exists (
        select 1
        from public.notification_preferences preference
        where preference.user_id = (select auth.uid())
          and preference.notification_type = notifications.notification_type
          and preference.enabled = false
      )
    )
  );

drop policy if exists "users mark relevant notifications read" on public.notifications;
create policy "users mark relevant notifications read"
  on public.notifications for update to authenticated
  using (
    (
      recipient_id = (select auth.uid())
      and company_id = private.current_company_id()
      and private.current_company_is_active()
    )
    or (
      recipient_id is null
      and (select private.can_manage_company(company_id))
    )
  )
  with check (
    (
      recipient_id = (select auth.uid())
      and company_id = private.current_company_id()
      and private.current_company_is_active()
    )
    or (
      recipient_id is null
      and (select private.can_manage_company(company_id))
    )
  );

drop policy if exists "users delete relevant notifications" on public.notifications;
create policy "users delete relevant notifications"
  on public.notifications for delete to authenticated
  using (
    (
      recipient_id = (select auth.uid())
      and company_id = private.current_company_id()
      and private.current_company_is_active()
    )
    or (
      recipient_id is null
      and (select private.can_manage_company(company_id))
    )
  );

drop policy if exists "user manages own notification_preferences" on public.notification_preferences;
create policy "user manages own notification_preferences"
  on public.notification_preferences for all to authenticated
  using (
    user_id = (select auth.uid())
    and (
      private.current_role_name() = 'owner'
      or private.current_company_is_active()
    )
  )
  with check (
    user_id = (select auth.uid())
    and (
      private.current_role_name() = 'owner'
      or private.current_company_is_active()
    )
  );

-- Logo writes are an owner-only operation in the app. The old bucket-wide
-- policies allowed any authenticated driver to overwrite arbitrary logos.
drop policy if exists "Authenticated users can upload company logos" on storage.objects;
drop policy if exists "Authenticated users can update company logos" on storage.objects;
drop policy if exists "owners upload company logos" on storage.objects;
drop policy if exists "owners update company logos" on storage.objects;
drop policy if exists "owners delete company logos" on storage.objects;

create policy "owners upload company logos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-logos'
    and private.current_role_name() = 'owner'
  );

create policy "owners update company logos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'company-logos'
    and private.current_role_name() = 'owner'
  )
  with check (
    bucket_id = 'company-logos'
    and private.current_role_name() = 'owner'
  );

create policy "owners delete company logos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'company-logos'
    and private.current_role_name() = 'owner'
  );

-- A driver may only touch their own folder inside their current active company.
drop policy if exists "driver manages own documents in storage" on storage.objects;
create policy "driver manages own documents in storage"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'documents'
    and private.current_company_is_active()
    and (storage.foldername(name))[1] = private.current_company_id()::text
    and (storage.foldername(name))[2] = 'driver'
    and (storage.foldername(name))[3] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'documents'
    and private.current_company_is_active()
    and (storage.foldername(name))[1] = private.current_company_id()::text
    and (storage.foldername(name))[2] = 'driver'
    and (storage.foldername(name))[3] = (select auth.uid())::text
  );
