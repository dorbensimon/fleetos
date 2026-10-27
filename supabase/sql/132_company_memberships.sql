-- 132: a manager can manage several companies.
--
-- company_memberships lists every company a manager may enter.
-- profiles.company_id stays and now means "the company the manager is in
-- right now": every RLS policy and Edge Function keeps reading it as before.
-- switch_company() is the only way a manager changes it, and only to a
-- company they are a member of. Drivers stay in one company.

create table if not exists public.company_memberships (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  primary key (user_id, company_id)
);
create index if not exists company_memberships_company_idx on public.company_memberships(company_id);

alter table public.company_memberships enable row level security;

-- Read-only from the app: a manager sees their own rows, the owner sees all.
-- Writes go through switch_company() and the service-role Edge Functions.
drop policy if exists "memberships read" on public.company_memberships;
create policy "memberships read" on public.company_memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or private.current_role_name() = 'owner');

revoke all on public.company_memberships from anon;
grant select on public.company_memberships to authenticated;
grant all on public.company_memberships to service_role;

-- Every existing manager keeps their company.
insert into public.company_memberships (user_id, company_id, last_used_at)
select id, company_id, now() from public.profiles
where role = 'admin' and company_id is not null
on conflict do nothing;

-- A manager profile created or moved to a company is a member of it, so the
-- existing create paths (create-company-admin, add-company-admin) need no
-- extra write.
create or replace function private.ensure_admin_membership()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.role = 'admin' and new.company_id is not null then
    insert into public.company_memberships (user_id, company_id, last_used_at)
    values (new.id, new.company_id, now())
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_admin_membership on public.profiles;
create trigger trg_ensure_admin_membership
  after insert or update of company_id, role on public.profiles
  for each row execute function private.ensure_admin_membership();

-- A manager may move their own active company only to one they belong to;
-- everything else stays owner-only, as before.
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.my_role() <> 'owner' then
    if new.role is distinct from old.role then
      raise exception 'לא ניתן לשנות תפקיד או שיוך לחברה';
    end if;
    if new.company_id is distinct from old.company_id and not (
      old.role = 'admin'
      and new.id = auth.uid()
      and exists (
        select 1 from public.company_memberships m
        where m.user_id = new.id and m.company_id = new.company_id
      )
    ) then
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
$function$;

-- The companies the signed-in manager can choose from, with the counts the
-- picker shows. Nothing else of the other companies is exposed.
create or replace function public.my_companies()
returns table (
  id uuid, name text, logo_url text, status text,
  vehicles integer, drivers integer, last_used_at timestamptz, is_current boolean
)
language sql
stable
security definer
set search_path to ''
as $$
  select c.id, c.name, c.logo_url, c.status,
    (select count(*)::int from public.vehicles v where v.company_id = c.id),
    (select count(*)::int from public.driver_details d where d.company_id = c.id and d.status <> 'archived'),
    m.last_used_at,
    c.id = p.company_id
  from public.company_memberships m
  join public.companies c on c.id = m.company_id
  join public.profiles p on p.id = m.user_id
  where m.user_id = (select auth.uid()) and p.role = 'admin'
  order by c.name
$$;

revoke execute on function public.my_companies() from public, anon;
grant execute on function public.my_companies() to authenticated;

-- Enters a company: the caller must be a manager who belongs to it, and it
-- must be active.
create or replace function public.switch_company(target uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or private.current_role_name() is distinct from 'admin' then
    raise exception 'not_allowed';
  end if;
  if not exists (
    select 1 from public.company_memberships m
    join public.companies c on c.id = m.company_id
    where m.user_id = caller and m.company_id = target and c.status = 'active'
  ) then
    raise exception 'not_allowed';
  end if;
  update public.profiles set company_id = target where id = caller and company_id is distinct from target;
  update public.company_memberships set last_used_at = now() where user_id = caller and company_id = target;
end;
$$;

revoke execute on function public.switch_company(uuid) from public, anon;
grant execute on function public.switch_company(uuid) to authenticated;

-- For the owner's "new company / add manager" forms (service role only):
-- who, if anyone, already has this email.
create or replace function public.find_account_by_email(p_email text)
returns table (id uuid, role text, full_name text)
language sql
stable
security definer
set search_path to ''
as $$
  select u.id, p.role, p.full_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(p_email))
  limit 1
$$;

revoke execute on function public.find_account_by_email(text) from public, anon, authenticated;
grant execute on function public.find_account_by_email(text) to service_role;

-- Daily email: every company a manager belongs to, in one email. With more
-- than one company each line starts with the company's name.
create or replace function public.email_digest_recipients()
returns table (email text, full_name text, company_name text, messages text[])
language sql
stable
security definer
set search_path to ''
as $$
  with lines as (
    select u.email::text as email, p.full_name, c.name as company, n.message, n.created_at
    from public.company_memberships m
    join public.profiles p on p.id = m.user_id and p.role = 'admin'
    join auth.users u on u.id = p.id
    join public.companies c on c.id = m.company_id and c.status = 'active'
    join public.notifications n
      on n.company_id = m.company_id
     and (n.recipient_id = p.id or n.recipient_id is null)
     and n.read_at is null
     and n.created_at > now() - interval '24 hours'
    where u.email is not null
      and not exists (
        select 1 from public.notification_preferences off
        where off.user_id = p.id and off.enabled = false
          and off.notification_type in ('email_daily_digest', n.notification_type)
      )
  ), spread as (
    select email, count(distinct company) as companies from lines group by email
  )
  select l.email, l.full_name, string_agg(distinct l.company, ' · '),
    array_agg(case when s.companies > 1 then l.company || ': ' || l.message else l.message end
              order by l.created_at desc)
  from lines l join spread s using (email)
  group by l.email, l.full_name
$$;

revoke execute on function public.email_digest_recipients() from public, anon, authenticated;
grant execute on function public.email_digest_recipients() to service_role;
