-- The activity log recorded only "vehicle X updated" for every change,
-- indistinguishable whether an admin edited the odometer, the department,
-- or the plate number. This adds a `details` column with a short,
-- field-specific Hebrew description of what actually changed, and extends
-- logging to the signing flow (send to sign / signed / declined / archived),
-- which previously had no trigger at all.

alter table public.activity_logs
  add column if not exists details text;

alter table public.activity_logs
  drop constraint if exists activity_logs_entity_type_check;
alter table public.activity_logs
  add constraint activity_logs_entity_type_check
  check (entity_type in (
    'department', 'vehicle', 'driver', 'profile', 'compliance',
    'document', 'assignment', 'signing_template', 'signature_request'
  ));

create or replace function private.log_company_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_data jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_data jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end;
  company uuid;
  label text;
  kind text;
  action_name text;
  actor uuid;
  actor_label text;
  changes text[] := array[]::text[];
  detail text;
  old_dept text;
  new_dept text;
begin
  company := (row_data->>'company_id')::uuid;
  if company is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  kind := case tg_table_name
    when 'departments' then 'department'
    when 'vehicles' then 'vehicle'
    when 'driver_details' then 'driver'
    when 'profiles' then 'profile'
    when 'documents' then 'document'
    when 'vehicle_drivers' then 'assignment'
    when 'signing_templates' then 'signing_template'
    when 'signature_requests' then 'signature_request'
    else 'compliance' end;

  label := case tg_table_name
    when 'departments' then row_data->>'name'
    when 'vehicles' then row_data->>'plate_number'
    when 'profiles' then row_data->>'full_name'
    when 'documents' then row_data->>'title'
    when 'driver_details' then (
      select person.full_name from public.profiles person
      where person.id = (row_data->>'id')::uuid
    )
    when 'vehicle_drivers' then row_data->>'driver_name'
    when 'signing_templates' then row_data->>'title'
    when 'signature_requests' then (
      select driver.full_name from public.profiles driver
      where driver.id = (row_data->>'driver_id')::uuid
    )
    else null end;

  action_name := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;

  actor := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
  select person.full_name into actor_label from public.profiles person where person.id = actor;

  -- Vehicles: odometer, status (archive), department and primary driver are
  -- the changes an admin actually cares about seeing named explicitly.
  if tg_table_name = 'vehicles' then
    if tg_op = 'UPDATE' then
      if (old_data->>'odometer') is distinct from (new_data->>'odometer') then
        changes := changes || format('קילומטר ברכב %s: %s ← %s', new_data->>'plate_number', old_data->>'odometer', new_data->>'odometer');
      end if;
      if (old_data->>'status') is distinct from (new_data->>'status') then
        changes := changes || case
          when new_data->>'status' = 'archived' then format('רכב %s הועבר לארכיון', new_data->>'plate_number')
          when old_data->>'status' = 'archived' then format('רכב %s שוחזר מהארכיון', new_data->>'plate_number')
          else format('סטטוס רכב %s: %s ← %s', new_data->>'plate_number', old_data->>'status', new_data->>'status')
        end;
      end if;
      if (old_data->>'department_id') is distinct from (new_data->>'department_id') then
        select name into old_dept from public.departments where id = (old_data->>'department_id')::uuid;
        select name into new_dept from public.departments where id = (new_data->>'department_id')::uuid;
        changes := changes || format('מחלקת רכב %s: %s ← %s', new_data->>'plate_number', coalesce(old_dept, 'ללא'), coalesce(new_dept, 'ללא'));
      end if;
      if (old_data->>'primary_driver_id') is distinct from (new_data->>'primary_driver_id') then
        changes := changes || format('נהג ראשי ברכב %s עודכן', new_data->>'plate_number');
      end if;
      if (old_data->>'plate_number') is distinct from (new_data->>'plate_number') then
        changes := changes || format('מספר רישוי: %s ← %s', old_data->>'plate_number', new_data->>'plate_number');
      end if;
    elsif tg_op = 'DELETE' then
      detail := format('רכב %s נמחק לצמיתות', old_data->>'plate_number');
    end if;

  -- Driver details: archive/restore, department and license expiry.
  elsif tg_table_name = 'driver_details' then
    if tg_op = 'UPDATE' then
      if (old_data->>'status') is distinct from (new_data->>'status') then
        changes := changes || case
          when new_data->>'status' = 'archived' then format('תיק הנהג %s הועבר לארכיון', label)
          else format('תיק הנהג %s שוחזר מהארכיון', label)
        end;
      end if;
      if (old_data->>'department_id') is distinct from (new_data->>'department_id') then
        select name into old_dept from public.departments where id = (old_data->>'department_id')::uuid;
        select name into new_dept from public.departments where id = (new_data->>'department_id')::uuid;
        changes := changes || format('מחלקת %s: %s ← %s', label, coalesce(old_dept, 'ללא'), coalesce(new_dept, 'ללא'));
      end if;
      if (old_data->>'license_expiry') is distinct from (new_data->>'license_expiry') then
        changes := changes || format('תוקף רישיון %s: %s ← %s', label, old_data->>'license_expiry', new_data->>'license_expiry');
      end if;
    elsif tg_op = 'DELETE' then
      detail := format('תיק הנהג %s נמחק לצמיתות', label);
    end if;

  -- Profiles: the fields a driver's own card can change.
  elsif tg_table_name = 'profiles' then
    if tg_op = 'UPDATE' then
      if (old_data->>'full_name') is distinct from (new_data->>'full_name') then
        changes := changes || format('שם: %s ← %s', old_data->>'full_name', new_data->>'full_name');
      end if;
      if (old_data->>'phone') is distinct from (new_data->>'phone') then
        changes := changes || format('טלפון של %s עודכן', new_data->>'full_name');
      end if;
      if (old_data->>'role') is distinct from (new_data->>'role') then
        changes := changes || format('תפקיד %s: %s ← %s', new_data->>'full_name', old_data->>'role', new_data->>'role');
      end if;
    end if;

  elsif tg_table_name = 'departments' then
    detail := case tg_op
      when 'INSERT' then format('נוצרה מחלקה: %s', label)
      when 'DELETE' then format('מחלקה הוסרה: %s', label)
      else format('מחלקה שונתה: %s', label) end;

  elsif tg_table_name = 'documents' then
    detail := case tg_op
      when 'INSERT' then format('הועלה מסמך "%s"', label)
      when 'DELETE' then format('מסמך "%s" נמחק', label)
      else format('מסמך "%s" עודכן', label) end;

  elsif tg_table_name = 'vehicle_drivers' then
    if tg_op = 'INSERT' then
      detail := format('%s שוייך לרכב %s', label, (select plate_number from public.vehicles where id = (new_data->>'vehicle_id')::uuid));
    elsif tg_op = 'UPDATE' and (old_data->>'unassigned_at') is null and (new_data->>'unassigned_at') is not null then
      detail := format('שיוך %s לרכב %s בוטל', label, (select plate_number from public.vehicles where id = (new_data->>'vehicle_id')::uuid));
    elsif tg_op = 'UPDATE' and (old_data->>'is_primary') is distinct from (new_data->>'is_primary') and (new_data->>'is_primary')::boolean then
      detail := format('%s הוגדר כנהג ראשי ברכב %s', label, (select plate_number from public.vehicles where id = (new_data->>'vehicle_id')::uuid));
    end if;

  elsif tg_table_name = 'signing_templates' then
    if tg_op = 'INSERT' then
      detail := format('נוצר תבנית מסמך לחתימה: "%s"', label);
    elsif tg_op = 'UPDATE' and (old_data->>'archived_at') is null and (new_data->>'archived_at') is not null then
      detail := format('תבנית "%s" הועברה לארכיון', label);
    elsif tg_op = 'DELETE' then
      detail := format('תבנית "%s" נמחקה', label);
    end if;

  elsif tg_table_name = 'signature_requests' then
    if tg_op = 'INSERT' then
      detail := format('נשלח מסמך "%s" לחתימת %s', label, (select full_name from public.profiles where id = (new_data->>'driver_id')::uuid));
    elsif tg_op = 'UPDATE' then
      if (old_data->>'status') is distinct from (new_data->>'status') then
        changes := changes || case new_data->>'status'
          when 'completed' then format('%s חתם על "%s"', label, (select title from public.signing_templates where id = (new_data->>'template_id')::uuid))
          when 'declined' then format('%s דחה את החתימה על "%s"', label, (select title from public.signing_templates where id = (new_data->>'template_id')::uuid))
          when 'cancelled' then format('בקשת החתימה של %s בוטלה', label)
          when 'failed' then format('שליחת המסמך ל-%s נכשלה', label)
          else format('סטטוס חתימה של %s: %s ← %s', label, old_data->>'status', new_data->>'status')
        end;
      end if;
      if (old_data->>'archived_at') is null and (new_data->>'archived_at') is not null then
        changes := changes || format('בקשת החתימה של %s הועברה לארכיון', label);
      end if;
    end if;
  end if;

  if detail is null and array_length(changes, 1) > 0 then
    detail := array_to_string(changes, '; ');
  end if;

  -- No detected field-level change on an UPDATE (e.g. an unrelated column
  -- touched by another trigger) still gets a generic line, never silence.
  if detail is null then
    detail := case action_name
      when 'created' then format('%s נוצר', coalesce(label, kind))
      when 'deleted' then format('%s נמחק', coalesce(label, kind))
      else format('%s עודכן', coalesce(label, kind)) end;
  end if;

  insert into public.activity_logs(company_id, actor_id, actor_name, action, entity_type, entity_id, entity_label, details)
  values (company, actor, actor_label, action_name, kind, (row_data->>'id')::uuid, label, detail);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'departments', 'vehicles', 'driver_details', 'profiles',
    'compliance_items', 'documents', 'vehicle_drivers',
    'signing_templates', 'signature_requests'
  ]
  loop
    execute format(
      'drop trigger if exists trg_activity_%1$s on public.%1$s; create trigger trg_activity_%1$s after insert or update or delete on public.%1$s for each row execute function private.log_company_activity();',
      t
    );
  end loop;
end $$;
