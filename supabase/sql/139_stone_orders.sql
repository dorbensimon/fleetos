-- Stone of Words: public "make your stone" page (/mystone).
-- Customers (not signed in) upload a finished print image and one row describing it.
-- Everything here is public by design: anyone can add a design and anyone can see
-- the wall. Nothing links to the fleet tables.

create table if not exists public.stone_orders (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  code          text not null check (code ~ '^[A-Z0-9]{4}$'),
  customer_name text not null check (char_length(customer_name) between 1 and 30),
  style         text not null check (style in ('full', 'post')),
  stone         text not null check (stone in ('white', 'cream')),
  username      text check (char_length(username) <= 20),
  location      text check (char_length(location) <= 30),
  nfc           boolean not null default false,
  nfc_link      text check (nfc_link ~ '^https://' and char_length(nfc_link) <= 300),
  image_path    text not null unique check (image_path ~ '^[0-9a-f-]{36}\.png$')
);

alter table public.stone_orders enable row level security;

-- A design stays on the public wall for 14 days, then drops off by itself.
drop policy if exists stone_orders_public_read on public.stone_orders;
create policy stone_orders_public_read on public.stone_orders
  for select to anon, authenticated
  using (created_at > now() - interval '14 days');

drop policy if exists stone_orders_public_add on public.stone_orders;
create policy stone_orders_public_add on public.stone_orders
  for insert to anon, authenticated
  with check (true);

-- Visitors may only set the design fields; id and created_at come from the server.
-- No update or delete for visitors: removing a design is done from the Supabase dashboard.
revoke all on public.stone_orders from anon, authenticated;
grant select on public.stone_orders to anon, authenticated;
grant insert (code, customer_name, style, stone, username, location, nfc, nfc_link, image_path)
  on public.stone_orders to anon, authenticated;

-- Public bucket for the print files: PNG only, 10 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stone-orders', 'stone-orders', true, 10485760, array['image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists stone_orders_public_upload on storage.objects;
create policy stone_orders_public_upload on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'stone-orders');
