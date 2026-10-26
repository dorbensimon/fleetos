-- Documents: extra fields a folder asks for on upload.
--
-- The driver's "נוהל 6" folder records an event with each file: its time,
-- what happened, the vehicle and the complaining driver's name and phone
-- (the event date goes in document_date). They are kept per document as
-- key/value text, so another folder can ask for its own fields later
-- without a new column.
--
-- Applied to production with Dor's approval on 2026-10-26.

alter table public.documents
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.documents drop constraint if exists documents_details_object;
alter table public.documents add constraint documents_details_object check (jsonb_typeof(details) = 'object');
