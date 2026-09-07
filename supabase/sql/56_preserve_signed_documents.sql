-- Signed documents are legal evidence: once a driver has signed, the record and
-- its signed PDF must survive every deletion an admin performs from the archive.
--
-- Two things previously destroyed that evidence:
--   1. permanent-delete on a completed request removed the row and the stored PDF.
--   2. signature_requests.template_id was "on delete cascade", so deleting an
--      archived template silently removed its signed requests as well.
--
-- After this migration a signed request is only ever hidden (deleted_at), and a
-- deleted template detaches from it instead of taking it down.

alter table public.signature_requests
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists template_title text;

-- The title is snapshotted so a signed request stays readable after its template
-- is gone. Backfill covers rows that were created before this column existed.
update public.signature_requests request
set template_title = template.title
from public.signing_templates template
where template.id = request.template_id
  and request.template_title is null;

-- A signed request outlives its template, so the link has to become optional.
alter table public.signature_requests
  alter column template_id drop not null;

alter table public.signature_requests
  drop constraint if exists signature_requests_template_id_fkey;

alter table public.signature_requests
  add constraint signature_requests_template_id_fkey
  foreign key (template_id) references public.signing_templates(id) on delete set null;

-- Every list in the app hides deleted rows, so index the live ones.
create index if not exists signature_requests_company_live_idx
  on public.signature_requests(company_id, created_at desc)
  where deleted_at is null;

create index if not exists signature_requests_driver_live_idx
  on public.signature_requests(driver_id, created_at desc)
  where deleted_at is null;

-- No client-facing delete policy exists on this table, so deletes remain
-- reachable only through the service role used by delete-signing-record.
