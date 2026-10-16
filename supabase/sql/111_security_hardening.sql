-- חיזוק אבטחה: אין יצירת פרופילים מהאתר, ואין TRUNCATE ללקוחות
--
-- 1. profiles INSERT: the policy only checked company_id, and the role guard
--    (prevent_privilege_escalation) runs on UPDATE only. A company admin could
--    therefore insert a profile with role = 'owner' for any auth user that had
--    no profile yet and turn it into a platform owner. The site never inserts
--    profiles; every account is created by an Edge Function with the service
--    role, which is not affected by this.
drop policy if exists "authenticated insert access" on public.profiles;
revoke insert on public.profiles from anon, authenticated;

-- 2. TRUNCATE ignores RLS. The API cannot issue it today, but no client role
--    should hold it (nor TRIGGER/REFERENCES), including on future tables.
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from anon, authenticated;
