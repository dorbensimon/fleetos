-- סידור עבודה: טלפון לקוח בנסיעה, ונסיעה קבועה בלי תאריך סיום
--
-- 1. A trip may keep the client's phone (optional).
-- 2. A recurring trip "until I cancel" is a row in schedule_series. Its trips
--    are still one row per day in schedule_trips (sharing series_id = the
--    series' id), made a few months ahead by the app; generated_until is the
--    last day already made. Cancelling the series sets end_date, and the app
--    stops making trips after it.
--
-- Only the company's managers (and the owner) read or write it, like the
-- other schedule tables (113_work_schedule.sql).

alter table public.schedule_trips
  add column if not exists client_phone text check (client_phone is null or char_length(client_phone) <= 20);

create table if not exists public.schedule_series (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  repeat text not null check (repeat in ('daily', 'weekly')),
  start_date date not null,
  -- null: no last day, the series goes on until it is cancelled.
  end_date date,
  generated_until date not null,
  start_time time not null,
  end_time time not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  client_name text check (client_name is null or char_length(client_name) <= 80),
  client_phone text check (client_phone is null or char_length(client_phone) <= 20),
  pickup text check (pickup is null or char_length(pickup) <= 80),
  destination text check (destination is null or char_length(destination) <= 80),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (end_date is null or end_date >= start_date - 1)
);
create index if not exists schedule_series_company on public.schedule_series (company_id);

drop trigger if exists trg_schedule_series_updated_at on public.schedule_series;
create trigger trg_schedule_series_updated_at
  before update on public.schedule_series
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_schedule_series_same_company on public.schedule_series;
create trigger trg_schedule_series_same_company
  before insert or update of company_id, vehicle_id, driver_id on public.schedule_series
  for each row execute function private.schedule_same_company();

alter table public.schedule_series enable row level security;
drop policy if exists "managers manage schedule_series" on public.schedule_series;
create policy "managers manage schedule_series" on public.schedule_series for all to authenticated
  using (private.can_manage_company(company_id))
  with check (private.can_manage_company(company_id));
revoke all on public.schedule_series from anon;
grant select, insert, update, delete on public.schedule_series to authenticated;
