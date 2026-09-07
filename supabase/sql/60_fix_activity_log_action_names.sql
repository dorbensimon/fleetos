-- Migration 59 used PostgreSQL trigger verbs (INSERT/UPDATE/DELETE) directly,
-- while activity_logs intentionally exposes human-readable action values.
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
