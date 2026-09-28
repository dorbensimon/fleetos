-- The super-admin (owner) runs a business on top of the platform: every
-- company is a customer. This adds what that needs and nothing the
-- companies themselves can see.
--
--   company_accounts     one row per company: status (trial / active /
--                        overdue / cancelled), plan, monthly price, billing
--                        cycle, trial end, renewal date, vehicle quota, the
--                        billing contact and private notes. Owner-only.
--   owner_notifications  the owner's own feed. About companies and their
--                        managers only, never about drivers. Owner-only.
--   owner_alert_log      makes every owner alert go out once per subject.
--
-- Owner alerts (switchable in notification_preferences):
--   owner_company_activated      a company's manager signed in and chose a
--                                password: the customer is live.
--   owner_admin_added            a company added another manager.
--   owner_company_not_activated  3 days after creation, still no manager in.
--   owner_company_inactive       an active company did nothing for 14 days.
--   owner_carrier_license_expiry the carrier licence ends within 30 days / ended.
--   owner_trial_ending           the trial ends within 7 days / ended.
--   owner_renewal_due            the renewal date is within 14 days / passed.
--   owner_vehicle_limit          the company reached its vehicle quota.
--
-- Push: a new owner notification calls push-notification-dispatch with
-- { ownerNotificationId }; the function sends it to every owner who didn't
-- switch that type off.
--
-- Approved by Dor on 2026-09-27.

begin;

-- ------------------------------------------------------------
-- 1. Customer accounts
-- ------------------------------------------------------------

create table if not exists public.company_accounts (
  company_id uuid primary key references public.companies(id) on delete cascade,
  status text not null default 'trial' check (status in ('trial', 'active', 'overdue', 'cancelled')),
  plan text check (plan is null or plan in ('basic', 'pro', 'enterprise')),
  monthly_price numeric(10, 2) check (monthly_price is null or monthly_price >= 0),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  trial_ends_at date,
  renewal_date date,
  vehicle_limit integer check (vehicle_limit is null or vehicle_limit > 0),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30),
  contact_email text check (contact_email is null or char_length(contact_email) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_accounts enable row level security;
revoke all on public.company_accounts from anon;
grant select, insert, update, delete on public.company_accounts to authenticated;

drop policy if exists "owner manages company accounts" on public.company_accounts;
create policy "owner manages company accounts" on public.company_accounts
  for all to authenticated
  using ((select private.current_role_name()) = 'owner')
  with check ((select private.current_role_name()) = 'owner');

create or replace function private.touch_company_account()
returns trigger language plpgsql set search_path to '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_company_account on public.company_accounts;
create trigger trg_touch_company_account before update on public.company_accounts
  for each row execute function private.touch_company_account();

-- A new company starts a 30-day trial; the owner's form may overwrite it.
create or replace function private.open_company_account()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into public.company_accounts (company_id, status, trial_ends_at)
  values (new.id, 'trial', (now() at time zone 'Asia/Jerusalem')::date + 30)
  on conflict (company_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_open_company_account on public.companies;
create trigger trg_open_company_account after insert on public.companies
  for each row execute function private.open_company_account();

-- Companies that already exist are running customers.
insert into public.company_accounts (company_id, status)
select id, 'active' from public.companies
on conflict (company_id) do nothing;

-- ------------------------------------------------------------
-- 2. The owner's feed
-- ------------------------------------------------------------

create table if not exists public.owner_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'owner_company_activated',
    'owner_admin_added',
    'owner_company_not_activated',
    'owner_company_inactive',
    'owner_carrier_license_expiry',
    'owner_trial_ending',
    'owner_renewal_due',
    'owner_vehicle_limit'
  )),
  title text not null,
  message text not null,
  tone text not null default 'info' check (tone in ('info', 'good', 'warn', 'bad')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists owner_notifications_created_idx on public.owner_notifications (created_at desc);
create index if not exists owner_notifications_company_idx on public.owner_notifications (company_id);

alter table public.owner_notifications enable row level security;
revoke all on public.owner_notifications from anon;
grant select, update, delete on public.owner_notifications to authenticated;

drop policy if exists "owner reads own feed" on public.owner_notifications;
create policy "owner reads own feed" on public.owner_notifications
  for select to authenticated
  using (
    (select private.current_role_name()) = 'owner'
    and not exists (
      select 1 from public.notification_preferences preference
      where preference.user_id = (select auth.uid())
        and preference.notification_type = owner_notifications.notification_type
        and preference.enabled = false
    )
  );

drop policy if exists "owner marks own feed" on public.owner_notifications;
create policy "owner marks own feed" on public.owner_notifications
  for update to authenticated
  using ((select private.current_role_name()) = 'owner')
  with check ((select private.current_role_name()) = 'owner');

drop policy if exists "owner clears own feed" on public.owner_notifications;
create policy "owner clears own feed" on public.owner_notifications
  for delete to authenticated
  using ((select private.current_role_name()) = 'owner');

create table if not exists public.owner_alert_log (
  notification_type text not null,
  subject_id uuid not null,
  anchor text not null,
  created_at timestamptz not null default now(),
  primary key (notification_type, subject_id, anchor)
);
alter table public.owner_alert_log enable row level security;
revoke all on public.owner_alert_log from anon, authenticated;

-- Writes one owner alert, once per (type, subject, anchor).
create or replace function private.owner_notify(
  p_company uuid, p_type text, p_anchor text, p_title text, p_message text, p_tone text default 'info'
) returns void language plpgsql security definer set search_path to '' as $$
declare
  inserted integer;
begin
  insert into public.owner_alert_log (notification_type, subject_id, anchor)
  values (p_type, p_company, p_anchor)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return; end if;
  insert into public.owner_notifications (company_id, notification_type, title, message, tone)
  values (p_company, p_type, p_title, p_message, p_tone);
end $$;

-- Owner types become switchable.
alter table public.notification_preferences drop constraint if exists notification_preferences_notification_type_check;
alter table public.notification_preferences add constraint notification_preferences_notification_type_check check (
  notification_type in (
    'driver_profile_update',
    'driver_document_upload',
    'vehicle_insurance_mandatory_expiry',
    'vehicle_insurance_comprehensive_expiry',
    'vehicle_annual_test_expiry',
    'vehicle_service_due',
    'driver_document_renewal',
    'signature_request_assigned',
    'vehicle_assignment',
    'driver_profile_updated_by_manager',
    'vehicle_license_expiry',
    'vehicle_operating_license_expiry',
    'vehicle_safety_officer_approval_expiry',
    'vehicle_tachograph_calibration_expiry',
    'vehicle_brakes_semiannual_expiry',
    'vehicle_brakes_annual_expiry',
    'vehicle_winter_inspection_expiry',
    'vehicle_child_detection_expiry',
    'driver_meeting_due',
    'license_update_requested',
    'license_update_reviewed',
    'driver_license_expiry',
    'company_carrier_license_expiry',
    'vehicle_odometer_stale',
    'signature_request_completed',
    'owner_company_activated',
    'owner_admin_added',
    'owner_company_not_activated',
    'owner_company_inactive',
    'owner_carrier_license_expiry',
    'owner_trial_ending',
    'owner_renewal_due',
    'owner_vehicle_limit'
  )
);

-- ------------------------------------------------------------
-- 3. Alerts from events
-- ------------------------------------------------------------

create or replace function private.owner_alerts_from_profiles()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  company_name text;
  company_created timestamptz;
begin
  if new.role <> 'admin' or new.company_id is null then return new; end if;
  select c.name, c.created_at into company_name, company_created from public.companies c where c.id = new.company_id;
  if company_name is null then return new; end if;

  if tg_op = 'UPDATE' and old.must_change_password and not new.must_change_password then
    perform private.owner_notify(
      new.company_id, 'owner_company_activated', new.id::text,
      company_name || ' התחילה לעבוד',
      'מנהל בחברה נכנס בפעם הראשונה ובחר סיסמה משלו.',
      'good'
    );
  elsif tg_op = 'INSERT' and company_created < now() - interval '1 hour' then
    perform private.owner_notify(
      new.company_id, 'owner_admin_added', new.id::text,
      'מנהל חדש ב' || company_name,
      'לחברה נוסף מנהל. אפשר לראות את פרטיו בדף החברה.',
      'info'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_owner_alerts_from_profiles on public.profiles;
create trigger trg_owner_alerts_from_profiles
  after insert or update of must_change_password on public.profiles
  for each row execute function private.owner_alerts_from_profiles();

-- ------------------------------------------------------------
-- 4. Daily alerts
-- ------------------------------------------------------------

create or replace function public.check_owner_notifications()
returns void language plpgsql security definer set search_path to '' as $$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  r record;
begin
  -- No manager has signed in 3 days after the company was created.
  for r in
    select c.id, c.name
    from public.companies c
    where c.status = 'active'
      and c.created_at < now() - interval '3 days'
      and not exists (
        select 1 from public.profiles p
        where p.company_id = c.id and p.role = 'admin' and not p.must_change_password
      )
  loop
    perform private.owner_notify(r.id, 'owner_company_not_activated', 'once',
      r.name || ' עוד לא התחילה',
      'עברו יותר משלושה ימים ואף מנהל בחברה לא נכנס. כדאי ליצור קשר ולוודא שקיבלו את פרטי הכניסה.',
      'warn');
  end loop;

  -- An active company went quiet for 14 days (once per quiet stretch).
  for r in
    select c.id, c.name, last.at as last_at
    from public.companies c
    left join lateral (
      select max(a.created_at) as at from public.activity_logs a where a.company_id = c.id
    ) last on true
    where c.status = 'active'
      and c.created_at < now() - interval '14 days'
      and coalesce(last.at, c.created_at) < now() - interval '14 days'
  loop
    perform private.owner_notify(r.id, 'owner_company_inactive',
      coalesce((r.last_at at time zone 'Asia/Jerusalem')::date::text, 'never'),
      r.name || ' לא פעילה',
      case when r.last_at is null then 'לא נרשמה בחברה אף פעולה מאז שנפתחה.'
           else 'הפעולה האחרונה בחברה הייתה ב-' || to_char(r.last_at at time zone 'Asia/Jerusalem', 'DD/MM/YYYY') || '. ייתכן שהלקוח צריך עזרה.' end,
      'warn');
  end loop;

  -- The carrier licence ends within 30 days, or ended.
  for r in
    select c.id, c.name, c.carrier_license_expiry as d
    from public.companies c
    where c.status = 'active' and c.carrier_license_expiry is not null
      and c.carrier_license_expiry <= today + 30
  loop
    perform private.owner_notify(r.id, 'owner_carrier_license_expiry',
      r.d::text || case when r.d <= today then ':expired' else ':before' end,
      case when r.d <= today then 'רישיון המוביל של ' || r.name || ' פג' else 'רישיון המוביל של ' || r.name || ' עומד לפוג' end,
      case when r.d <= today then 'התוקף פג ב-' || to_char(r.d, 'DD/MM/YYYY') || '.'
           else 'התוקף יפוג בעוד ' || (r.d - today) || ' ימים (' || to_char(r.d, 'DD/MM/YYYY') || ').' end,
      case when r.d <= today then 'bad' else 'warn' end);
  end loop;

  -- The trial ends within 7 days, or ended.
  for r in
    select c.id, c.name, a.trial_ends_at as d
    from public.company_accounts a
    join public.companies c on c.id = a.company_id
    where a.status = 'trial' and a.trial_ends_at is not null and a.trial_ends_at <= today + 7
  loop
    perform private.owner_notify(r.id, 'owner_trial_ending',
      r.d::text || case when r.d <= today then ':ended' else ':before' end,
      case when r.d <= today then 'תקופת הניסיון של ' || r.name || ' הסתיימה' else 'תקופת הניסיון של ' || r.name || ' מסתיימת' end,
      case when r.d <= today then 'הניסיון הסתיים ב-' || to_char(r.d, 'DD/MM/YYYY') || '. זה הזמן להפוך אותם ללקוח משלם.'
           else 'נשארו ' || (r.d - today) || ' ימים לניסיון (' || to_char(r.d, 'DD/MM/YYYY') || ').' end,
      case when r.d <= today then 'bad' else 'warn' end);
  end loop;

  -- The renewal date is within 14 days, or passed.
  for r in
    select c.id, c.name, a.renewal_date as d
    from public.company_accounts a
    join public.companies c on c.id = a.company_id
    where a.status in ('active', 'overdue') and a.renewal_date is not null and a.renewal_date <= today + 14
  loop
    perform private.owner_notify(r.id, 'owner_renewal_due',
      r.d::text || case when r.d < today then ':passed' else ':before' end,
      case when r.d < today then 'מועד החידוש של ' || r.name || ' עבר' else 'חידוש מנוי: ' || r.name end,
      case when r.d < today then 'החידוש היה אמור להיות ב-' || to_char(r.d, 'DD/MM/YYYY') || '. עדכן את תאריך החידוש הבא או את סטטוס התשלום.'
           when r.d = today then 'החידוש היום.'
           else 'החידוש בעוד ' || (r.d - today) || ' ימים (' || to_char(r.d, 'DD/MM/YYYY') || ').' end,
      case when r.d < today then 'bad' else 'info' end);
  end loop;

  -- The company reached its vehicle quota (again after the quota changes).
  for r in
    select c.id, c.name, a.vehicle_limit as lim, count(v.id) as used
    from public.company_accounts a
    join public.companies c on c.id = a.company_id and c.status = 'active'
    join public.vehicles v on v.company_id = c.id and v.status <> 'archived'
    where a.vehicle_limit is not null
    group by c.id, c.name, a.vehicle_limit
    having count(v.id) >= a.vehicle_limit
  loop
    perform private.owner_notify(r.id, 'owner_vehicle_limit', r.lim::text,
      r.name || ' הגיעה למכסת הרכבים',
      'בשימוש ' || r.used || ' רכבים מתוך ' || r.lim || ' במנוי. זו הזדמנות להציע שדרוג.',
      'info');
  end loop;
end $$;

revoke all on function public.check_owner_notifications() from public, anon, authenticated;

select cron.unschedule('check-owner-notifications')
where exists (select 1 from cron.job where jobname = 'check-owner-notifications');
select cron.schedule('check-owner-notifications', '0 5 * * *', $$ select public.check_owner_notifications() $$);

-- ------------------------------------------------------------
-- 5. Push
-- ------------------------------------------------------------

create or replace function private.dispatch_owner_push_notification()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/push-notification-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-push-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_secret')
    ),
    body := jsonb_build_object('ownerNotificationId', new.id),
    timeout_milliseconds := 10000
  );
  return new;
end $$;

drop trigger if exists trg_dispatch_owner_push_notification on public.owner_notifications;
create trigger trg_dispatch_owner_push_notification after insert on public.owner_notifications
  for each row execute function private.dispatch_owner_push_notification();

commit;
