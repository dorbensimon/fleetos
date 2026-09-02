-- Cover archive/cancellation actor foreign keys to keep deletes and joins efficient.
create index if not exists signing_templates_archived_by_idx
  on public.signing_templates(archived_by)
  where archived_by is not null;

create index if not exists signature_requests_archived_by_idx
  on public.signature_requests(archived_by)
  where archived_by is not null;

create index if not exists signature_requests_cancelled_by_idx
  on public.signature_requests(cancelled_by)
  where cancelled_by is not null;
