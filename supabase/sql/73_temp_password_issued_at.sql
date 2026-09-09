-- ============================================================
-- 73_temp_password_issued_at.sql
--
-- Admins invent a driver/admin's temporary password with no expiry and no
-- visibility into how stale it's gotten (item #10/#11 of the driver
-- onboarding review). This adds the visibility half: a timestamp of when
-- the current pending temporary password was issued, so the admin UI can
-- show "waiting since <date>" instead of leaving a must_change_password
-- account looking the same on day 1 and day 100.
--
-- created_at already defaults to now() at account creation, but it stays
-- fixed forever — a password reset (reset-user-password) doesn't move it,
-- so it can't answer "how long has *this* temporary password been live".
-- password_set_at is bumped on every event that hands the user a new
-- temporary password: initial creation (falls back to the column default)
-- and admin-initiated reset.
--
-- Guarded by the same trigger as must_change_password: only the service
-- role (Edge Functions) may change it, for the same reason — a client
-- could otherwise fake a fresher issue date to hide how overdue an account
-- is.
-- ============================================================

-- Only backfill while introducing the column. Re-running this file must not
-- replace a newer reset timestamp with the account's original creation date.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'password_set_at'
  ) then
    alter table public.profiles
      add column password_set_at timestamptz not null default now();

    update public.profiles
    set password_set_at = created_at
    where must_change_password = true;
  end if;
end
$$;

create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() <> 'owner' then
    if new.role is distinct from old.role or new.company_id is distinct from old.company_id then
      raise exception 'לא ניתן לשנות תפקיד או שיוך לחברה';
    end if;
    if new.must_change_password is distinct from old.must_change_password then
      raise exception 'לא ניתן לשנות סטטוס החלפת סיסמה ישירות';
    end if;
    if new.password_set_at is distinct from old.password_set_at then
      raise exception 'לא ניתן לשנות תאריך הנפקת סיסמה ישירות';
    end if;
  end if;
  return new;
end;
$$;
