-- Stores the vehicle colour returned by the Ministry of Transport registry.
-- The lookup itself remains read-only; this column is populated only when
-- an authorised FleetOS administrator saves the vehicle record.

alter table public.vehicles
  add column if not exists color text;
