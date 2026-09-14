-- Native Expo push-notification delivery for every newly-created in-app notification.

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
grant select, insert, update, delete on public.push_tokens to service_role;

drop trigger if exists push_tokens_touch_updated_at on public.push_tokens;
create trigger push_tokens_touch_updated_at before update on public.push_tokens
  for each row execute function public.touch_updated_at();

-- The database generates and retains the callback secret in Vault. It never
-- appears in the mobile app, the Edge Function source, or logs.
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'push_dispatch_secret'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'push_dispatch_secret'
);

create or replace function public.validate_push_dispatch_secret(candidate text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_secret text;
begin
  select decrypted_secret into expected_secret
  from vault.decrypted_secrets
  where name = 'push_dispatch_secret';

  return candidate is not null
    and expected_secret is not null
    and encode(extensions.digest(convert_to(candidate, 'UTF8'), 'sha256'), 'hex')
      = encode(extensions.digest(convert_to(expected_secret, 'UTF8'), 'sha256'), 'hex');
end;
$$;

revoke execute on function public.validate_push_dispatch_secret(text)
  from public, anon, authenticated;
grant execute on function public.validate_push_dispatch_secret(text) to service_role;

create or replace function private.dispatch_native_push_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/push-notification-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-push-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_secret')
    ),
    body := jsonb_build_object('notificationId', new.id),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;

drop trigger if exists trg_dispatch_native_push_notification on public.notifications;
create trigger trg_dispatch_native_push_notification
  after insert on public.notifications
  for each row execute function private.dispatch_native_push_notification();

revoke execute on function private.dispatch_native_push_notification() from public, anon, authenticated;
