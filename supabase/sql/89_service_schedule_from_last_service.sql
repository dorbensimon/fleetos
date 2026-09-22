-- Service schedule fix.
--
-- The next service is due at last_service_km + service_interval_km. The
-- desktop vehicle card used to store odometer + interval instead, so a
-- vehicle whose last service was long ago could show "15,000 km left"
-- while it was actually overdue. The app now derives the value from the
-- last service; this migration:
-- 1. Corrects stored next_service_km on every vehicle that has an interval.
--    (trg_reset_service_notified clears service_notified_at on the rows it
--    changes, so their service alert is re-evaluated by the next scan.)
-- 2. Extends the daily scan so an overdue vehicle (remaining <= 0) gets an
--    alert too — the previous window (0..1000 km) skipped it entirely.
--    Same notification type and the same one-time marker as before.
--
-- NOTE: the function body below is the version that is live in the
-- database (verified 2026-09-22), NOT the one in 42_*.sql — migration 42
-- was never applied, and basing this on it would silently deploy it too.
-- Only the service loop differs from the live body.

update public.vehicles
set next_service_km = last_service_km + service_interval_km
where service_interval_km is not null
  and service_interval_km > 0
  and next_service_km is distinct from last_service_km + service_interval_km;

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
  item_notification_type text;
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
    item_notification_type := case r.item_type
      when 'insurance_mandatory' then 'vehicle_insurance_mandatory_expiry'
      when 'insurance_comprehensive' then 'vehicle_insurance_comprehensive_expiry'
      when 'annual_test' then 'vehicle_annual_test_expiry'
    end;
    vehicle_label := trim(both ' ' from coalesce(r.manufacturer, '') || ' ' || coalesce(r.model, ''))
      || ' (' || r.plate_number || ')';

    insert into public.notifications (company_id, message, notification_type)
    values (
      r.company_id,
      'לרכב ' || vehicle_label || ' נותרו ' || (r.expiry_date - current_date)
        || ' ימים לחידוש ' || item_label || ' (בתוקף עד ' || to_char(r.expiry_date, 'DD/MM/YYYY') || ')',
      item_notification_type
    );

    update public.compliance_items set expiry_notified_at = now() where id = r.compliance_id;
  end loop;

  for r in
    select v.id as vehicle_id, v.company_id, v.plate_number, v.manufacturer, v.model,
           v.odometer, v.next_service_km
    from public.vehicles v
    where v.next_service_km is not null
      and v.next_service_km - v.odometer <= 1000
      and v.service_notified_at is null
  loop
    vehicle_label := trim(both ' ' from coalesce(r.manufacturer, '') || ' ' || coalesce(r.model, ''))
      || ' (' || r.plate_number || ')';

    insert into public.notifications (company_id, message, notification_type)
    values (
      r.company_id,
      case
        when r.next_service_km - r.odometer <= 0 then
          'הרכב ' || vehicle_label || ' עבר את מועד הטיפול ב-' || (r.odometer - r.next_service_km) || ' ק"מ'
        else
          'לרכב ' || vehicle_label || ' נותרו ' || (r.next_service_km - r.odometer) || ' ק"מ לטיפול הבא'
      end,
      'vehicle_service_due'
    );

    update public.vehicles set service_notified_at = now() where id = r.vehicle_id;
  end loop;
end;
$$;
