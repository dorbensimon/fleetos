-- ============================================================
-- 93_driver_document_upload_notification_target.sql
--
-- "<driver> העלה/תה מסמך" notifications did not lead anywhere when tapped:
-- production still ran the migration-30 version of
-- log_driver_document_upload(), which inserts without a notification_type,
-- so the client could not tell what the notification was about (migration
-- 35's typed version never reached production for this function). An
-- untyped row also escaped the per-type mute in notification_preferences.
--
-- This restores the type and records the document's category in
-- folder_key, so tapping the notification opens that driver's card on the
-- folder the document was uploaded to (license_docs opens the license).
-- Rows already stored without a type are backfilled the same way.
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

  insert into public.notifications (company_id, actor_id, actor_name, message, notification_type, folder_key)
  values (
    new.company_id,
    auth.uid(),
    coalesce(actor_full_name, 'נהג'),
    coalesce(actor_full_name, 'נהג') || ' העלה/תה מסמך: ' || new.title,
    'driver_document_upload',
    new.category
  );

  return new;
end;
$$;

revoke execute on function public.log_driver_document_upload() from public, anon, authenticated;

-- Backfill: untyped upload notifications get their type, and the category
-- of the driver's document with that title uploaded closest in time.
update public.notifications n
   set notification_type = 'driver_document_upload',
       folder_key = coalesce(n.folder_key, (
         select d.category
           from public.documents d
          where d.owner_type = 'driver'
            and d.owner_id = n.actor_id
            and d.title = substring(n.message from position(' העלה/תה מסמך: ' in n.message) + length(' העלה/תה מסמך: '))
            and d.created_at between n.created_at - interval '5 minutes' and n.created_at + interval '5 minutes'
          order by abs(extract(epoch from d.created_at - n.created_at))
          limit 1
       ))
 where n.notification_type is null
   and n.actor_id is not null
   and position(' העלה/תה מסמך: ' in n.message) > 0;
