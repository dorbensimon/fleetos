-- ============================================================
-- 71_lock_must_change_password_column.sql
--
-- profiles.must_change_password is the gate that forces a first-time (or
-- post-reset) login to go through SetPasswordScreen before reaching any
-- home screen (see resolveRouteForUser in lib/session.ts). But the RLS
-- policy that lets a driver/admin update their own profile row ("user
-- updates own profile", 22_driver_self_service.sql) placed no restriction
-- on which columns that self-update could touch — so any authenticated
-- driver or admin could clear the flag themselves with a direct API call,
-- without ever setting a real password of their own, and keep using
-- whichever temporary password an admin assigned them indefinitely.
--
-- prevent_privilege_escalation() already protects role/company_id the
-- same way for non-owners. This folds must_change_password into the same
-- guard: only the service role (used exclusively by our Edge Functions —
-- complete-password-setup, reset-user-password, create-company-driver,
-- create-company-admin, add-company-admin) can change it. A caller with a
-- normal authenticated session, of any role but owner, gets rejected.
-- ============================================================

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
  end if;
  return new;
end;
$$;
