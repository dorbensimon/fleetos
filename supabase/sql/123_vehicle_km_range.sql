-- Vehicle kilometres: only readings that can exist.
--
-- A manager could save an odometer of 1,500,019,500 km (typing into a field
-- that already held the old value), and the phone's service form saved an
-- empty "service every" / "next service" field as 0, which the fleet list
-- read as "service overdue by the whole odometer". The same bound the
-- safety inspections use (migration 103): 0 to 9,999,999 km, and an
-- interval or next service of 0 means "not entered".
--
-- Applied to production with Dor's approval on 2026-10-25.

update public.vehicles set service_interval_km = null where service_interval_km = 0;
update public.vehicles set next_service_km = null where next_service_km = 0;

alter table public.vehicles drop constraint if exists vehicles_km_range;
alter table public.vehicles add constraint vehicles_km_range check (
  odometer between 0 and 9999999
  and last_service_km between 0 and 9999999
  and (service_interval_km is null or service_interval_km between 1 and 9999999)
  and (next_service_km is null or next_service_km between 1 and 9999999)
);
