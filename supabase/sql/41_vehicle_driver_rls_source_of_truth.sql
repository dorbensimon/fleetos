-- ============================================================
-- 41_vehicle_driver_rls_source_of_truth.sql
--
-- Fix driver-facing reads after the move to `vehicle_drivers` as the
-- source of truth for active assignments.
--
-- Before this migration, driver RLS on `vehicles` still relied on the
-- legacy `vehicles.primary_driver_id` column. Admin assignment screens
-- now write only to `vehicle_drivers`, so a freshly assigned driver
-- could appear correctly in admin UI yet still be unable to read their
-- own vehicle row. The app then rendered "אין רכב משויך" because the
-- join `vehicle_drivers -> vehicle` came back with `vehicle = null`
-- under RLS.
--
-- The same legacy assumption also affected vehicle compliance reads for
-- drivers, so this migration updates both policies to use active rows in
-- `vehicle_drivers`.
-- ============================================================

drop policy if exists "driver reads own vehicle" on public.vehicles;
drop policy if exists "authenticated select access" on public.vehicles;

create policy "authenticated select access" on public.vehicles
  for select
  to authenticated
  using (
    private.can_manage_company(company_id)
    or exists (
      select 1
      from public.vehicle_drivers vd
      where vd.vehicle_id = vehicles.id
        and vd.driver_id = (select auth.uid())
        and vd.unassigned_at is null
    )
  );

drop policy if exists "driver reads own vehicle compliance" on public.compliance_items;
drop policy if exists "authenticated select access" on public.compliance_items;

create policy "authenticated select access" on public.compliance_items
  for select
  to authenticated
  using (
    private.can_manage_company(company_id)
    or (owner_type = 'driver' and owner_id = (select auth.uid()))
    or (
      owner_type = 'vehicle'
      and exists (
        select 1
        from public.vehicle_drivers vd
        where vd.vehicle_id = compliance_items.owner_id
          and vd.driver_id = (select auth.uid())
          and vd.unassigned_at is null
      )
    )
  );
