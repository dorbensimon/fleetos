-- 136_inspection_lists_by_vehicle_kind.sql
--
-- "בדיקת קצין בטיחות" gets its own list of items for each kind of vehicle
-- (car, bus, truck, trailer, forklift, equipment, small), instead of one list
-- for the whole company. The ready-made lists and which vehicle type belongs
-- to which kind are in supabase/functions/_shared/inspectionKinds.ts.
--
-- forms: the company's own list for each kind it changed, keyed by kind; a
-- kind left out keeps its ready-made list. The old single `form` is moved to
-- the car kind and is no longer read (it was empty in every company when
-- this was written, 2026-11-03).
--
-- Applied to production with Dor's approval on 2026-11-03, before the
-- vehicle-inspection function that reads `forms` (v8).

begin;

alter table public.vehicle_inspection_settings
  add column if not exists forms jsonb not null default '{}'::jsonb;

alter table public.vehicle_inspection_settings
  drop constraint if exists vehicle_inspection_settings_forms_check;
alter table public.vehicle_inspection_settings
  add constraint vehicle_inspection_settings_forms_check check (
    jsonb_typeof(forms) = 'object'
    and forms - array['car', 'bus', 'truck', 'trailer', 'forklift', 'equipment', 'small'] = '{}'::jsonb
  );

update public.vehicle_inspection_settings
set forms = jsonb_build_object('car', form)
where form is not null and forms = '{}'::jsonb;

comment on column public.vehicle_inspection_settings.form is 'Replaced by forms (136); no longer read.';

commit;
