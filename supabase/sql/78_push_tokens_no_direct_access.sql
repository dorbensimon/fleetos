-- Tokens are managed only by the authenticated Edge Function. This explicit
-- deny policy preserves RLS even if a future grant is added accidentally.
drop policy if exists "no direct push token access" on public.push_tokens;
create policy "no direct push token access"
  on public.push_tokens for all to authenticated
  using (false)
  with check (false);
