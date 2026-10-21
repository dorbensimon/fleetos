-- Free text on a vehicle-in-garage / driver-away mark: what is being fixed, the cost, and so on.
alter table public.schedule_blocks
  add column if not exists details text check (details is null or char_length(details) <= 500);
