-- More vehicle types (passenger, cargo, work equipment, other).
-- Keeps the original four values: car, minibus (מסחרי), bus, truck.

alter table public.vehicles drop constraint if exists vehicles_type_check;
alter table public.vehicles add constraint vehicles_type_check check (vehicle_type in (
  'car', 'dual_use', 'taxi', 'minibus', 'passenger_minibus', 'microbus', 'small_bus', 'bus', 'touring_bus',
  'truck', 'tractor_truck', 'tanker', 'trailer',
  'tractor', 'atv', 'engineering', 'forklift', 'pedestrian_forklift', 'operational',
  'motorcycle', 'golf_cart'
));
