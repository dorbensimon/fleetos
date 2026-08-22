-- ============================================================
-- 22_driver_self_service.sql
--
-- Drivers were read-only everywhere (per the original design), which
-- meant they couldn't upload their own documents, edit their own
-- contact info, or even clear must_change_password after setting a
-- password (SetPasswordScreen's update was silently no-op-ing under
-- RLS for the driver role). This adds the minimum write access needed:
--
--   documents       - a driver can insert/update/delete their OWN rows
--   profiles        - a driver (or admin) can update their OWN row
--
-- The dangerous columns (role, company_id) are protected by a trigger
-- below, not by column-level grants, because the existing GRANT on
-- profiles already covers every column for `authenticated` - RLS row
-- policies alone can't restrict which columns a self-update touches.
-- ============================================================

create policy "driver manages own documents"
  on public.documents
  for all
  using (owner_type = 'driver' and owner_id = auth.uid())
  with check (owner_type = 'driver' and owner_id = auth.uid());

create policy "user updates own profile"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

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
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_privilege_escalation on public.profiles;
create trigger trg_prevent_privilege_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_privilege_escalation();
