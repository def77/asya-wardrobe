-- Обновление 2: сезоны и новые категории (верхняя одежда, головные уборы, украшения).
-- Выполнить один раз в Supabase → SQL Editor → Run.
alter table public.items add column if not exists seasons text[] not null default '{}';
alter table public.items drop constraint if exists items_cat_check;
alter table public.items add constraint items_cat_check
  check (cat in ('top', 'bottom', 'shoes', 'bag', 'outer', 'hat', 'jewelry'));
