-- 120_vehicle_registry_details.sql
--
-- Everything the Transport Ministry registry (data.gov.il) knows about a
-- vehicle beyond the fields that already have their own column: trim level,
-- engine, fuel, tires, last annual test, seats, weights, drive, tow hitch...
-- Kept as one object of text values; keys match REGISTRY_DETAIL_FIELDS in
-- lib/vehicleRegistryFields.ts. Managers can edit or clear any value.
alter table public.vehicles
  add column if not exists registry_details jsonb not null default '{}'::jsonb;

alter table public.vehicles drop constraint if exists vehicles_registry_details_object;
alter table public.vehicles
  add constraint vehicles_registry_details_object check (jsonb_typeof(registry_details) = 'object');
