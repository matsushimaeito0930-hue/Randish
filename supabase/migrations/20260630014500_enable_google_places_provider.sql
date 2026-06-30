-- Allow Google Places results to be stored as restaurant history/favorites.
-- Some older Supabase schemas limited restaurant providers to the first
-- providers we used, so this migration makes the provider set explicit.

alter table if exists public.random_histories
  add column if not exists provider varchar(80) not null default 'RANDISH_SEED',
  add column if not exists provider_place_id varchar(255) not null default '';

alter table if exists public.favorite_restaurants
  add column if not exists provider varchar(80) not null default 'RANDISH_SEED',
  add column if not exists provider_place_id varchar(255) not null default '';

do $$
begin
  if to_regclass('public.random_histories') is not null then
    update public.random_histories
    set provider = 'GOOGLE_PLACES'
    where upper(provider) in ('GOOGLE', 'GOOGLE_PLACE', 'GOOGLE_PLACES_API');
  end if;

  if to_regclass('public.favorite_restaurants') is not null then
    update public.favorite_restaurants
    set provider = 'GOOGLE_PLACES'
    where upper(provider) in ('GOOGLE', 'GOOGLE_PLACE', 'GOOGLE_PLACES_API');
  end if;

  if to_regclass('public.restaurants') is not null then
    update public.restaurants
    set external_provider = 'GOOGLE_PLACES'
    where upper(external_provider) in ('GOOGLE', 'GOOGLE_PLACE', 'GOOGLE_PLACES_API');
  end if;

  if to_regclass('public.restaurant_enrichments') is not null then
    update public.restaurant_enrichments
    set provider = 'GOOGLE_PLACES'
    where upper(provider) in ('GOOGLE', 'GOOGLE_PLACE', 'GOOGLE_PLACES_API');
  end if;
end $$;

do $$
declare
  target record;
begin
  for target in
    select n.nspname as schema_name, t.relname as table_name, c.conname as constraint_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'c'
      and n.nspname = 'public'
      and t.relname in ('restaurants', 'restaurant_enrichments', 'random_histories', 'favorite_restaurants')
      and pg_get_constraintdef(c.oid) ilike '%provider%'
      and pg_get_constraintdef(c.oid) not ilike '%GOOGLE_PLACES%'
  loop
    execute format(
      'alter table %I.%I drop constraint %I',
      target.schema_name,
      target.table_name,
      target.constraint_name
    );
  end loop;
end $$;

do $$
begin
  if to_regclass('public.restaurants') is not null
      and not exists (
        select 1 from pg_constraint
        where conrelid = 'public.restaurants'::regclass
          and conname = 'ck_restaurants_external_provider_known'
      ) then
    alter table public.restaurants
      add constraint ck_restaurants_external_provider_known
      check (external_provider in ('RANDISH_SEED', 'HOTPEPPER', 'GEOAPIFY', 'GOOGLE_PLACES'));
  end if;

  if to_regclass('public.restaurant_enrichments') is not null
      and not exists (
        select 1 from pg_constraint
        where conrelid = 'public.restaurant_enrichments'::regclass
          and conname = 'ck_restaurant_enrichments_provider_known'
      ) then
    alter table public.restaurant_enrichments
      add constraint ck_restaurant_enrichments_provider_known
      check (provider in ('HOTPEPPER', 'GEOAPIFY', 'GOOGLE_PLACES'));
  end if;

  if to_regclass('public.random_histories') is not null
      and not exists (
        select 1 from pg_constraint
        where conrelid = 'public.random_histories'::regclass
          and conname = 'ck_random_histories_provider_known'
      ) then
    alter table public.random_histories
      add constraint ck_random_histories_provider_known
      check (provider in ('RANDISH_SEED', 'HOTPEPPER', 'GEOAPIFY', 'GOOGLE_PLACES'));
  end if;

  if to_regclass('public.favorite_restaurants') is not null
      and not exists (
        select 1 from pg_constraint
        where conrelid = 'public.favorite_restaurants'::regclass
          and conname = 'ck_favorite_restaurants_provider_known'
      ) then
    alter table public.favorite_restaurants
      add constraint ck_favorite_restaurants_provider_known
      check (provider in ('RANDISH_SEED', 'HOTPEPPER', 'GEOAPIFY', 'GOOGLE_PLACES'));
  end if;
end $$;

do $$
begin
  if to_regclass('public.random_histories') is not null then
    create index if not exists idx_random_histories_provider
      on public.random_histories(provider, provider_place_id);
  end if;

  if to_regclass('public.favorite_restaurants') is not null then
    create index if not exists idx_favorite_restaurants_provider
      on public.favorite_restaurants(provider, provider_place_id);
  end if;
end $$;
