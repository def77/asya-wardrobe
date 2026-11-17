-- Гардероб Аси: выполнить один раз в Supabase → SQL Editor → New query → Run

create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  cat        text not null check (cat in ('top', 'bottom', 'shoes', 'bag', 'outer', 'hat', 'jewelry')),
  name       text not null default '',
  img_path   text not null,
  box        float8[],
  seasons    text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.looks (
  id         uuid primary key default gen_random_uuid(),
  outfit     jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  key   text primary key,
  value jsonb
);

-- доступ только тем, кто вошёл (аккаунты создаются вручную в Authentication → Users)
alter table public.items    enable row level security;
alter table public.looks    enable row level security;
alter table public.settings enable row level security;

grant select, insert, update, delete on public.items, public.looks, public.settings to authenticated;

drop policy if exists "wardrobe owners" on public.items;
drop policy if exists "wardrobe owners" on public.looks;
drop policy if exists "wardrobe owners" on public.settings;
create policy "wardrobe owners" on public.items    for all to authenticated using (true) with check (true);
create policy "wardrobe owners" on public.looks    for all to authenticated using (true) with check (true);
create policy "wardrobe owners" on public.settings for all to authenticated using (true) with check (true);

-- закрытое хранилище для фото
insert into storage.buckets (id, name, public)
values ('wardrobe', 'wardrobe', false)
on conflict (id) do nothing;

drop policy if exists "wardrobe read"   on storage.objects;
drop policy if exists "wardrobe write"  on storage.objects;
drop policy if exists "wardrobe update" on storage.objects;
drop policy if exists "wardrobe delete" on storage.objects;
create policy "wardrobe read"   on storage.objects for select to authenticated using (bucket_id = 'wardrobe');
create policy "wardrobe write"  on storage.objects for insert to authenticated with check (bucket_id = 'wardrobe');
create policy "wardrobe update" on storage.objects for update to authenticated using (bucket_id = 'wardrobe');
create policy "wardrobe delete" on storage.objects for delete to authenticated using (bucket_id = 'wardrobe');
