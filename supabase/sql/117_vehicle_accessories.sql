-- Accessory equipment kept in a vehicle (spare wheel, jack, warning triangle...).
-- Keys match VEHICLE_ACCESSORY_LABELS in lib/compliance.ts.
alter table public.vehicles
  add column if not exists accessories text[] not null default '{}'
  check (accessories <@ array[
    'warning_triangle', 'spare_wheel', 'jack', 'lug_wrench', 'wheel_lock_key',
    'tire_repair_kit', 'toolbox', 'screwdrivers', 'tow_hitch'
  ]::text[]);
