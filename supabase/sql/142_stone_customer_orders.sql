-- Stone of Words: a customer's own page behind the shared QR code.
-- One customer (one phone, or one personal link) can send several stones in one order,
-- come back later to add more, and see only their own stones change status.

-- customer_key is the customer's secret: made in their browser, kept there, never readable
-- by anyone through the API. customer_ref is a one-way fingerprint of it, safe to read,
-- used by the owner page to put a customer's stones together.
-- closed_at: the owner closes an order; stones sent after that start a new one.
alter table public.stone_orders
  add column if not exists customer_key uuid,
  add column if not exists customer_ref text generated always as (md5(customer_key::text)) stored,
  add column if not exists closed_at timestamptz;

create index if not exists stone_orders_customer_key_idx on public.stone_orders (customer_key);

-- New step between "sent" and "ready": the owner approves a design before making it.
-- new = waiting for approval (the customer can still remove it), approved = being made.
alter table public.stone_orders drop constraint if exists stone_orders_status_check;
alter table public.stone_orders
  add constraint stone_orders_status_check check (status in ('new', 'approved', 'ready', 'done'));

-- Reading is now column by column so the secret stays out of the wall and the owner page.
revoke select on public.stone_orders from anon, authenticated;
grant select (id, created_at, code, customer_name, style, stone, username, location, nfc, nfc_link,
              image_path, status, customer_ref, closed_at)
  on public.stone_orders to anon, authenticated;
grant insert (customer_key) on public.stone_orders to anon, authenticated;
grant update (closed_at) on public.stone_orders to authenticated; -- the owner-only policy (140) still decides who

-- The customer's own stones, newest first. Knowing the secret is the only way in.
create or replace function public.stone_my_orders(p_key uuid)
returns table (code text, customer_name text, style text, stone text, status text,
               image_path text, created_at timestamptz, closed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select o.code, o.customer_name, o.style, o.stone, o.status, o.image_path, o.created_at, o.closed_at
  from public.stone_orders o
  where o.customer_key = p_key
  order by o.created_at desc
  limit 100;
$$;

-- Removing a stone (only while it waits for approval) goes through the stone-remove
-- Edge Function, which also deletes the print file; visitors get no delete rights here.
-- The function works as service_role, which has no default rights on this table.
grant select, delete on public.stone_orders to service_role;

revoke all on function public.stone_my_orders(uuid) from public;
grant execute on function public.stone_my_orders(uuid) to anon, authenticated;
