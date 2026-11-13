-- Stone of Words: order tracking.
-- A customer types the code from the end of /mystone and sees whether the stone is
-- ready. Only the platform owner changes the status, from /mystone/orders.

alter table public.stone_orders
  add column if not exists status text not null default 'new'
    check (status in ('new', 'ready', 'done'));

-- A code now points at exactly one order. The page asks for a fresh code on a clash.
-- ponytail: 4 characters = ~920k codes, never reused. Go to 5 characters if it fills up.
create unique index if not exists stone_orders_code_key on public.stone_orders (code);

-- Customers read the status through the existing public 14-day read policy and can
-- never set it: their insert grant (139) does not include this column.

-- The owner sees every order, old ones included, and is the only one who can change one.
drop policy if exists stone_orders_owner_read on public.stone_orders;
create policy stone_orders_owner_read on public.stone_orders
  for select to authenticated
  using ((select private.current_role_name()) = 'owner');

drop policy if exists stone_orders_owner_update on public.stone_orders;
create policy stone_orders_owner_update on public.stone_orders
  for update to authenticated
  using ((select private.current_role_name()) = 'owner')
  with check ((select private.current_role_name()) = 'owner');

grant update (status) on public.stone_orders to authenticated;
