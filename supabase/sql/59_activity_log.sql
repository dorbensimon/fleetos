create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('created','updated','deleted')),
  entity_type text not null check (entity_type in ('department','vehicle','driver','profile','compliance','document','assignment')),
  entity_id uuid, entity_label text, created_at timestamptz not null default now()
);
create index if not exists activity_logs_company_created_idx on public.activity_logs(company_id, created_at desc);
alter table public.activity_logs enable row level security;
drop policy if exists "managers read company activity" on public.activity_logs;
create policy "managers read company activity" on public.activity_logs for select to authenticated using (private.can_manage_company(company_id));
revoke all on public.activity_logs from anon, authenticated;
grant select on public.activity_logs to authenticated;

-- Trigger functions are implementation details, never public RPC endpoints.
revoke execute on function public.prevent_vehicle_department_cross_company() from public, anon, authenticated;

create or replace function private.log_company_activity() returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end; company uuid; label text; kind text; action_name text;
begin
  company := (row_data->>'company_id')::uuid;
  if company is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  kind := case tg_table_name when 'departments' then 'department' when 'vehicles' then 'vehicle' when 'driver_details' then 'driver' when 'profiles' then 'profile' when 'documents' then 'document' when 'vehicle_drivers' then 'assignment' else 'compliance' end;
  label := case tg_table_name when 'departments' then row_data->>'name' when 'vehicles' then row_data->>'plate_number' when 'profiles' then row_data->>'full_name' when 'documents' then row_data->>'title' else null end;
  action_name := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  insert into public.activity_logs(company_id, actor_id, action, entity_type, entity_id, entity_label) values (company, auth.uid(), action_name, kind, (row_data->>'id')::uuid, label);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
do $$ declare t text; begin foreach t in array array['departments','vehicles','driver_details','profiles','compliance_items','documents','vehicle_drivers'] loop execute format('drop trigger if exists trg_activity_%1$s on public.%1$s; create trigger trg_activity_%1$s after insert or update or delete on public.%1$s for each row execute function private.log_company_activity();', t); end loop; end $$;
