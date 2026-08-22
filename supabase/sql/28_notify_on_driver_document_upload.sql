-- ============================================================
-- 28_notify_on_driver_document_upload.sql
--
-- migration 25's notification trigger only covered profiles/
-- driver_details edits - a driver uploading their own document (an
-- INSERT into public.documents, not an UPDATE) never generated a
-- notification. This adds the matching trigger for that case.
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
     or new.owner_type is distinct from 'driver' then
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

drop trigger if exists trg_log_driver_document_upload on public.documents;
create trigger trg_log_driver_document_upload
  after insert on public.documents
  for each row
  execute function public.log_driver_document_upload();
