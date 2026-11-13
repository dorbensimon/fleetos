-- Stone of Words: the platform owner can delete an order completely from /mystone/orders,
-- the row and its print file. Nobody else can delete anything.

drop policy if exists stone_orders_owner_delete on public.stone_orders;
create policy stone_orders_owner_delete on public.stone_orders
  for delete to authenticated
  using ((select private.current_role_name()) = 'owner');

grant delete on public.stone_orders to authenticated;

-- Removing a file through the storage API needs both to see it and to delete it.
drop policy if exists stone_orders_owner_file_read on storage.objects;
create policy stone_orders_owner_file_read on storage.objects
  for select to authenticated
  using (bucket_id = 'stone-orders' and (select private.current_role_name()) = 'owner');

drop policy if exists stone_orders_owner_file_delete on storage.objects;
create policy stone_orders_owner_file_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'stone-orders' and (select private.current_role_name()) = 'owner');
