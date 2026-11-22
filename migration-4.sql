-- Обновление 4: цвета вещей (включает обновления 2 и 3; можно выполнять сколько угодно раз).
-- Supabase → SQL Editor → New query → Run.
alter table public.items add column if not exists seasons text[] not null default '{}';
alter table public.items add column if not exists colors  text[] not null default '{}';
alter table public.items drop constraint if exists items_cat_check;
alter table public.items add constraint items_cat_check
  check (cat in ('top', 'bottom', 'dress', 'shoes', 'bag', 'outer', 'hat', 'jewelry'));
notify pgrst, 'reload schema';
