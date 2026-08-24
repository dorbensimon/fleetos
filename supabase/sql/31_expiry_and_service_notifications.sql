-- ============================================================
-- 31_expiry_and_service_notifications.sql
--
-- One-time admin alerts for two things:
--   1. Insurance (חובה/מקיף) or annual test (טסט) expiring within
--      20 days.
--   2. A vehicle within 1000 km of its next scheduled service.
--
-- "One-time" is enforced with a *_notified_at marker column: the
-- daily job only inserts a notification when the marker is still
-- null, then sets it. A trigger clears the marker back to null
-- whenever the underlying date/km target changes (renewed policy,
-- new test date, service done / interval changed) so the next
-- time the vehicle drifts back into the window it alerts again.
-- ============================================================

alter table public.compliance_items add column if not exists expiry_notified_at timestamptz;
alter table public.vehicles         add column if not exists service_notified_at timestamptz;

-- ------------------------------------------------------------
-- Reset the marker whenever the tracked target moves, so a
-- renewed document / completed service can alert again later.
-- ------------------------------------------------------------

create or replace function public.reset_compliance_notified()
returns trigger
language plpgsql
as $$
begin
  if new.expiry_date is distinct from old.expiry_date then
    new.expiry_notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_compliance_notified on public.compliance_items;
create trigger trg_reset_compliance_notified
  before update on public.compliance_items
  for each row execute function public.reset_compliance_notified();

create or replace function public.reset_service_notified()
returns trigger
language plpgsql
as $$
begin
  if new.next_service_km is distinct from old.next_service_km then
    new.service_notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_service_notified on public.vehicles;
create trigger trg_reset_service_notified
  before update on public.vehicles
  for each row execute function public.reset_service_notified();

-- ------------------------------------------------------------
-- The daily scan itself.
-- ------------------------------------------------------------

create or replace function public.check_vehicle_expiry_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  item_label text;
  vehicle_label text;
begin
  for r in
    select ci.id as compliance_id, ci.company_id, ci.item_type, ci.expiry_date,
           v.plate_number, v.manufacturer, v.model
    from public.compliance_items ci
    join public.vehicles v on v.id = ci.owner_id and ci.owner_type = 'vehicle'
    where ci.item_type in ('insurance_mandatory', 'insurance_comprehensive', 'annual_test')
      and ci.expiry_date is not null
      and ci.expiry_date - current_date between 0 and 20
      and ci.expiry_notified_at is null
  loop
    item_label := case r.item_type
      when 'insurance_mandatory' then 'ביטוח חובה'
      when 'insurance_comprehensive' then 'ביטוח מקיף'
      when 'annual_test' then 'טסט שנתי'
      else r.item_type
    end;
    vehicle_label := trim(both ' ' from coalesce(r.manufacturer, '') || ' ' || coalesce(r.model, ''))
      || ' (' || r.plate_number || ')';

    insert into public.notifications (company_id, message)
    values (
      r.company_id,
      'לרכב ' || vehicle_label || ' נותרו ' || (r.expiry_date - current_date)
        || ' ימים לחידוש ' || item_label || ' (בתוקף עד ' || to_char(r.expiry_date, 'DD/MM/YYYY') || ')'
    );

    update public.compliance_items set expiry_notified_at = now() where id = r.compliance_id;
  end loop;

  for r in
    select v.id as vehicle_id, v.company_id, v.plate_number, v.manufacturer, v.model,
           v.odometer, v.next_service_km
    from public.vehicles v
    where v.next_service_km is not null
      and v.next_service_km - v.odometer between 0 and 1000
      and v.service_notified_at is null
  loop
    vehicle_label := trim(both ' ' from coalesce(r.manufacturer, '') || ' ' || coalesce(r.model, ''))
      || ' (' || r.plate_number || ')';

    insert into public.notifications (company_id, message)
    values (
      r.company_id,
      'לרכב ' || vehicle_label || ' נותרו ' || (r.next_service_km - r.odometer) || ' ק"מ לטיפול הבא'
    );

    update public.vehicles set service_notified_at = now() where id = r.vehicle_id;
  end loop;
end;
$$;

grant execute on function public.check_vehicle_expiry_notifications() to service_role;

-- ------------------------------------------------------------
-- Daily schedule. 04:00 UTC — ahead of mika (05:40 IDT) and
-- omer (06:00 IDT) so admins see fresh alerts before those runs.
-- ------------------------------------------------------------

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'check-vehicle-expiry-notifications',
  '0 4 * * *',
  $$ select public.check_vehicle_expiry_notifications() $$
);
