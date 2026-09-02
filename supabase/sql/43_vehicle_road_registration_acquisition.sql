-- Adds two vehicle fields requested for the vehicle details form:
-- 1. road_registration_date (תאריך עליה לכביש) — date the vehicle went on the road.
-- 2. acquisition_type (סוג עסקה) — purchase / leasing / rental.

alter table public.vehicles add column if not exists road_registration_date date;

alter table public.vehicles add column if not exists acquisition_type text;

alter table public.vehicles drop constraint if exists vehicles_acquisition_type_check;
alter table public.vehicles add constraint vehicles_acquisition_type_check
  check (acquisition_type is null or acquisition_type in ('purchase', 'leasing', 'rental'));
