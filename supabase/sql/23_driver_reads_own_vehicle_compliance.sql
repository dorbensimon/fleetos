-- ============================================================
-- 23_driver_reads_own_vehicle_compliance.sql
--
-- U2 ("הרכב שלי") shows the driver's assigned vehicle's insurance and
-- annual-test status. The driver already reads the vehicle row itself
-- (primary_driver_id = auth.uid()), but compliance_items only had a
-- driver-read policy scoped to owner_type='driver' - this adds the
-- matching one for owner_type='vehicle', limited to the driver's own
-- assigned vehicle.
-- ============================================================

create policy "driver reads own vehicle compliance"
  on public.compliance_items
  for select
  using (
    owner_type = 'vehicle'
    and exists (
      select 1 from public.vehicles v
      where v.id = compliance_items.owner_id
        and v.primary_driver_id = auth.uid()
    )
  );
