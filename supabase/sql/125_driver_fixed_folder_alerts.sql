-- Driver folders: expiry alerts for the fixed folders too.
--
-- Until now the daily driver-folder scan (migration 112) only looked at the
-- folders a company added itself ('folder:<id>'). Since 2026-10-26 every
-- fixed folder of the driver file takes a valid-until date as well
-- (lib/driverDocumentFolders.ts), so the same scan now covers them, with the
-- same notification type, lead time and once-per-stage bookkeeping. The
-- titles below match the Hebrew folder names on the driver card.
--
-- Applied to production with Dor's approval on 2026-10-26.

create or replace function public.check_driver_folder_expiry_notifications()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  date_label text;
begin
  for r in
    with folders as (
      select f.company_id, 'folder:' || f.id::text as folder_key, f.title
      from public.company_document_folders f
      where f.owner_type = 'driver' and f.tracks_expiry
    ),
    fixed(folder_key, title) as (values
      ('general', 'מסמכים כלליים'),
      ('transport_info', 'מסמכי מידע תעבורתי'),
      ('driver_file', 'תיק נהג'),
      ('notes_feedback', 'הערות ותגובות'),
      ('traffic_reports', 'דוחות תעבורה'),
      ('accompanying_drivers', 'נהגים נלווים'),
      ('procedure_6', 'נוהל 6'),
      ('certifications', 'הסמכות והכשרות'),
      ('hazmat', 'חומרים מסוכנים'),
      ('trainings', 'הדרכות והכשרות')
    ),
    latest as (
      select distinct on (d.owner_id, d.category)
             d.company_id, d.owner_id as driver_id, d.category as folder_key, d.expiry_date,
             coalesce(f.title, x.title) as title
      from public.documents d
      left join folders f on f.folder_key = d.category and f.company_id = d.company_id
      left join fixed x on x.folder_key = d.category
      where d.owner_type = 'driver'
        and (f.folder_key is not null or x.folder_key is not null)
      order by d.owner_id, d.category, d.created_at desc
    ),
    candidates as (
      select l.*, p.full_name,
             case
               when l.expiry_date <= current_date then 'expired'
               when l.expiry_date - current_date <= coalesce((c.notification_lead_days ->> 'driver_custom_folder_expiry')::integer, 30) then 'before'
             end as stage
      from latest l
      join public.profiles p on p.id = l.driver_id and p.role = 'driver'
      left join public.driver_details dd on dd.id = l.driver_id
      join public.companies c on c.id = l.company_id and c.status = 'active'
      where l.expiry_date is not null
        and coalesce(dd.status, '') <> 'archived'
    )
    select ca.* from candidates ca
    where ca.stage is not null
      and not exists (
        select 1 from public.driver_folder_expiry_alerts a
        where a.driver_id = ca.driver_id and a.folder_key = ca.folder_key
          and a.expiry_date = ca.expiry_date and a.stage = ca.stage
      )
  loop
    date_label := to_char(r.expiry_date, 'DD/MM/YYYY');

    insert into public.notifications (company_id, actor_id, actor_name, message, notification_type, folder_key)
    values (
      r.company_id, r.driver_id, r.full_name,
      case when r.stage = 'expired'
        then 'תוקף ' || r.title || ' של הנהג ' || coalesce(r.full_name, '') || ' פג ב-' || date_label
        else 'תוקף ' || r.title || ' של הנהג ' || coalesce(r.full_name, '') || ' יפוג בעוד ' || (r.expiry_date - current_date) || ' ימים (' || date_label || ')'
      end,
      'driver_custom_folder_expiry', r.folder_key
    );

    insert into public.notifications (company_id, recipient_id, actor_id, actor_name, message, notification_type, folder_key)
    values (
      r.company_id, r.driver_id, r.driver_id, r.full_name,
      case when r.stage = 'expired'
        then 'תוקף ' || r.title || ' שלך פג ב-' || date_label
        else 'תוקף ' || r.title || ' שלך יפוג בעוד ' || (r.expiry_date - current_date) || ' ימים (' || date_label || ')'
      end,
      'driver_custom_folder_expiry', r.folder_key
    );

    insert into public.driver_folder_expiry_alerts (company_id, driver_id, folder_key, expiry_date, stage)
    values (r.company_id, r.driver_id, r.folder_key, r.expiry_date, r.stage)
    on conflict on constraint driver_folder_expiry_alerts_unique do nothing;
  end loop;
end;
$function$;
