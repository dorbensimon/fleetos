-- ============================================================
-- 30_document_upload_trigger_owner_check.sql
--
-- 28's log_driver_document_upload() checked the caller's role and
-- new.owner_type, but never that the document actually belongs to the
-- caller — unlike log_driver_self_edit() in 25, which bails out on
-- `new.id is distinct from auth.uid()`.
--
-- Today the "driver manages own documents" policy (22) already forces
-- owner_id = auth.uid() on insert, so the two can't diverge. But if
-- that policy ever loosens (say, an admin uploading on a driver's
-- behalf), the trigger would announce "<admin> העלה/תה מסמך" for a
-- document owned by someone else. Aligning the guard with 25 now.
-- ============================================================

create or replace function public.log_driver_document_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_full_name text;
begin
  if auth.uid() is null
     or public.current_role_name() is distinct from 'driver'
     or new.owner_type is distinct from 'driver'
     or new.owner_id is distinct from auth.uid() then
    return new;
  end if;

  select full_name into actor_full_name from public.profiles where id = auth.uid();

  insert into public.notifications (company_id, actor_id, actor_name, message)
  values (
    new.company_id,
    auth.uid(),
    coalesce(actor_full_name, 'נהג'),
    coalesce(actor_full_name, 'נהג') || ' העלה/תה מסמך: ' || new.title
  );

  return new;
end;
$$;
