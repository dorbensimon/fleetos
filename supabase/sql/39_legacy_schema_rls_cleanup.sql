-- Consolidate legacy RLS policies without changing their authorization union.
-- Move SECURITY DEFINER helpers behind a non-exposed schema and cache auth calls.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_role_name()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function private.current_company_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.company_id from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function private.can_manage_company(target_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_role_name() = 'owner'
    or (
      private.current_role_name() = 'admin'
      and private.current_company_id() = target_company
    )
$$;

revoke all on function private.current_role_name() from public, anon;
revoke all on function private.current_company_id() from public, anon;
revoke all on function private.can_manage_company(uuid) from public, anon;
grant execute on function private.current_role_name() to authenticated, service_role;
grant execute on function private.current_company_id() to authenticated, service_role;
grant execute on function private.can_manage_company(uuid) to authenticated, service_role;

create or replace function pg_temp.rewrite_legacy_policy(expression text)
returns text language plpgsql immutable as $$
begin
  if expression is null then
    return null;
  end if;

  expression := replace(expression, 'private.can_manage_company(', '__private_can_manage_company__(');
  expression := replace(expression, 'public.can_manage_company(', '__private_can_manage_company__(');
  expression := replace(expression, 'can_manage_company(', 'private.can_manage_company(');
  expression := replace(expression, '__private_can_manage_company__(', 'private.can_manage_company(');
  expression := replace(expression, 'private.current_company_id()', '__private_current_company_id__()');
  expression := replace(expression, 'public.current_company_id()', '__private_current_company_id__()');
  expression := replace(expression, 'current_company_id()', 'private.current_company_id()');
  expression := replace(expression, '__private_current_company_id__()', 'private.current_company_id()');
  expression := replace(expression, 'private.current_role_name()', '__private_current_role_name__()');
  expression := replace(expression, 'public.current_role_name()', '__private_current_role_name__()');
  expression := replace(expression, 'current_role_name()', 'private.current_role_name()');
  expression := replace(expression, '__private_current_role_name__()', 'private.current_role_name()');
  expression := replace(expression, 'public.my_company_id()', '__private_current_company_id__()');
  expression := replace(expression, 'my_company_id()', 'private.current_company_id()');
  expression := replace(expression, '__private_current_company_id__()', 'private.current_company_id()');
  expression := replace(expression, 'public.my_role()', '__private_current_role_name__()');
  expression := replace(expression, 'my_role()', 'private.current_role_name()');
  expression := replace(expression, '__private_current_role_name__()', 'private.current_role_name()');
  expression := replace(expression, 'auth.uid()', '(select auth.uid())');
  return expression;
end
$$;

create temporary table legacy_policy_snapshot on commit drop as
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  pg_temp.rewrite_legacy_policy(qual) as qual,
  pg_temp.rewrite_legacy_policy(with_check) as with_check
from pg_policies
where schemaname = 'public'
  and tablename = any (array[
    'companies', 'compliance_items', 'departments', 'documents',
    'driver_details', 'profiles', 'vehicle_driver_history',
    'vehicle_drivers', 'vehicles', 'driver_document_sends'
  ]);

do $$
declare
  table_name text;
  policy_row record;
  action_name text;
  using_expression text;
  check_expression text;
begin
  for policy_row in select * from legacy_policy_snapshot loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;

  for table_name in
    select distinct tablename from legacy_policy_snapshot order by tablename
  loop
    foreach action_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      using_expression := null;
      check_expression := null;

      if action_name in ('SELECT', 'UPDATE', 'DELETE') then
        select string_agg('(' || qual || ')', ' OR ' order by policyname)
        into using_expression
        from legacy_policy_snapshot
        where tablename = table_name
          and cmd in ('ALL', action_name)
          and qual is not null;
      end if;

      if action_name in ('INSERT', 'UPDATE') then
        select string_agg('(' || coalesce(with_check, qual) || ')', ' OR ' order by policyname)
        into check_expression
        from legacy_policy_snapshot
        where tablename = table_name
          and cmd in ('ALL', action_name)
          and coalesce(with_check, qual) is not null;
      end if;

      if (action_name in ('SELECT', 'DELETE') and using_expression is not null)
         or (action_name = 'INSERT' and check_expression is not null)
         or (action_name = 'UPDATE' and using_expression is not null and check_expression is not null)
      then
        execute format(
          'create policy %I on public.%I for %s to authenticated%s%s',
          'authenticated ' || lower(action_name) || ' access',
          table_name,
          action_name,
          case when using_expression is not null
            then ' using (' || using_expression || ')' else '' end,
          case when check_expression is not null
            then ' with check (' || check_expression || ')' else '' end
        );
      end if;
    end loop;
  end loop;
end
$$;

-- Rebuild remaining helper-based policies in place, outside the consolidated tables.
do $$
declare
  policy_row record;
  role_list text;
  using_clause text;
  check_clause text;
begin
  for policy_row in
    select
      schemaname,
      tablename,
      policyname,
      cmd,
      roles,
      pg_temp.rewrite_legacy_policy(qual) as qual,
      pg_temp.rewrite_legacy_policy(with_check) as with_check
    from pg_policies
    where (
      coalesce(qual, '') ~ '(can_manage_company|current_company_id|current_role_name|my_company_id|my_role)'
      or coalesce(with_check, '') ~ '(can_manage_company|current_company_id|current_role_name|my_company_id|my_role)'
    )
      and not (
        schemaname = 'public'
        and tablename = any (array[
          'companies', 'compliance_items', 'departments', 'documents',
          'driver_details', 'profiles', 'vehicle_driver_history',
          'vehicle_drivers', 'vehicles', 'driver_document_sends'
        ])
      )
  loop
    role_list := case
      when 'public' = any(policy_row.roles) then 'authenticated'
      else (
        select string_agg(quote_ident(role_name::text), ', ')
        from unnest(policy_row.roles) role_name
      )
    end;
    using_clause := case when policy_row.qual is not null
      then ' using (' || policy_row.qual || ')' else '' end;
    check_clause := case when policy_row.with_check is not null
      then ' with check (' || policy_row.with_check || ')' else '' end;

    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
    execute format(
      'create policy %I on %I.%I for %s to %s%s%s',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename,
      policy_row.cmd,
      role_list,
      using_clause,
      check_clause
    );
  end loop;
end
$$;

-- The remaining auth-only policy does not use one of the helper functions.
drop policy if exists "user manages own notification_preferences"
  on public.notification_preferences;
create policy "user manages own notification_preferences"
  on public.notification_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke execute on function public.can_manage_company(uuid) from public, anon, authenticated;
revoke execute on function public.current_company_id() from public, anon, authenticated;
revoke execute on function public.current_role_name() from public, anon, authenticated;
revoke execute on function public.my_company_id() from public, anon, authenticated;
revoke execute on function public.my_role() from public, anon, authenticated;
