-- Enable RLS for Randish public tables before production/demo exposure.
-- This migration does not delete or update application data.
--
-- Important impact:
-- - Tables without policies become inaccessible to Supabase anon/authenticated clients.
-- - Billing, payment, Premium, pending email, app user credentials, and provider enrichment
--   tables are intentionally kept backend-only.
-- - Do not FORCE RLS here; the Spring Boot backend is expected to use a trusted database
--   role/service role path for server-side writes and payment processing.

alter table if exists public.app_users enable row level security;
alter table if exists public.pending_email_registrations enable row level security;
alter table if exists public.premium_products enable row level security;
alter table if exists public.billing_customers enable row level security;
alter table if exists public.subscriptions enable row level security;
alter table if exists public.premium_grants enable row level security;
alter table if exists public.payment_events enable row level security;
alter table if exists public.payment_records enable row level security;
alter table if exists public.feature_usage_counters enable row level security;
alter table if exists public.restaurants enable row level security;
alter table if exists public.restaurant_enrichments enable row level security;
alter table if exists public.random_histories enable row level security;
alter table if exists public.favorite_restaurants enable row level security;
alter table if exists public.visit_collections enable row level security;
alter table if exists public.expense_memos enable row level security;
alter table if exists public.stamps enable row level security;

do $$
declare
  target_table text;
  target_role text;
begin
  foreach target_table in array array[
    'app_users',
    'pending_email_registrations',
    'premium_products',
    'billing_customers',
    'subscriptions',
    'premium_grants',
    'payment_events',
    'payment_records',
    'feature_usage_counters',
    'restaurants',
    'restaurant_enrichments',
    'random_histories',
    'favorite_restaurants',
    'visit_collections',
    'expense_memos',
    'stamps'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is not null then
      foreach target_role in array array['anon', 'authenticated']
      loop
        if to_regrole(target_role) is not null then
          execute format('revoke all on table public.%I from %I', target_table, target_role);
        end if;
      end loop;
    end if;
  end loop;
end $$;

do $$
declare
  grant_spec record;
begin
  if to_regrole('authenticated') is null then
    return;
  end if;

  for grant_spec in
    select *
    from (values
      ('restaurants', 'select'),
      ('favorite_restaurants', 'select, insert, update, delete'),
      ('random_histories', 'select, insert'),
      ('visit_collections', 'select, insert, update, delete'),
      ('expense_memos', 'select, insert, update, delete'),
      ('stamps', 'select'),
      ('feature_usage_counters', 'select')
    ) as grants(table_name, privileges)
  loop
    if to_regclass(format('public.%I', grant_spec.table_name)) is not null then
      execute format(
        'grant %s on table public.%I to authenticated',
        grant_spec.privileges,
        grant_spec.table_name
      );
    end if;
  end loop;
end $$;

do $$
declare
  policy_spec record;
begin
  if to_regprocedure('auth.uid()') is null then
    raise exception 'auth.uid() is required for Randish RLS policies. Run this migration on Supabase Postgres.';
  end if;

  for policy_spec in
    select *
    from (values
      (
        'restaurants',
        'authenticated can read restaurants',
        'select',
        'true',
        null::text,
        false
      ),
      (
        'favorite_restaurants',
        'users can read own favorite restaurants',
        'select',
        'auth.uid()::text = user_id',
        null::text,
        true
      ),
      (
        'favorite_restaurants',
        'users can insert own favorite restaurants',
        'insert',
        null::text,
        'auth.uid()::text = user_id',
        true
      ),
      (
        'favorite_restaurants',
        'users can update own favorite restaurants',
        'update',
        'auth.uid()::text = user_id',
        'auth.uid()::text = user_id',
        true
      ),
      (
        'favorite_restaurants',
        'users can delete own favorite restaurants',
        'delete',
        'auth.uid()::text = user_id',
        null::text,
        true
      ),
      (
        'random_histories',
        'users can read own random histories',
        'select',
        'auth.uid()::text = user_id',
        null::text,
        true
      ),
      (
        'random_histories',
        'users can insert own random histories',
        'insert',
        null::text,
        'auth.uid()::text = user_id',
        true
      ),
      (
        'visit_collections',
        'users can read own visit collections',
        'select',
        'auth.uid()::text = user_id',
        null::text,
        true
      ),
      (
        'visit_collections',
        'users can insert own visit collections',
        'insert',
        null::text,
        'auth.uid()::text = user_id',
        true
      ),
      (
        'visit_collections',
        'users can update own visit collections',
        'update',
        'auth.uid()::text = user_id',
        'auth.uid()::text = user_id',
        true
      ),
      (
        'visit_collections',
        'users can delete own visit collections',
        'delete',
        'auth.uid()::text = user_id',
        null::text,
        true
      ),
      (
        'expense_memos',
        'users can read own expense memos',
        'select',
        'auth.uid()::text = user_id',
        null::text,
        true
      ),
      (
        'expense_memos',
        'users can insert own expense memos',
        'insert',
        null::text,
        'auth.uid()::text = user_id and (visit_collection_id is null or exists (select 1 from public.visit_collections vc where vc.id = visit_collection_id and vc.user_id = auth.uid()::text))',
        true
      ),
      (
        'expense_memos',
        'users can update own expense memos',
        'update',
        'auth.uid()::text = user_id',
        'auth.uid()::text = user_id and (visit_collection_id is null or exists (select 1 from public.visit_collections vc where vc.id = visit_collection_id and vc.user_id = auth.uid()::text))',
        true
      ),
      (
        'expense_memos',
        'users can delete own expense memos',
        'delete',
        'auth.uid()::text = user_id',
        null::text,
        true
      ),
      (
        'stamps',
        'users can read own stamps',
        'select',
        'auth.uid()::text = user_id',
        null::text,
        true
      ),
      (
        'feature_usage_counters',
        'users can read own feature usage counters',
        'select',
        'auth.uid()::text = user_id',
        null::text,
        true
      )
    ) as policies(table_name, policy_name, command_name, using_expression, check_expression, requires_user_id)
  loop
    if to_regclass(format('public.%I', policy_spec.table_name)) is null then
      raise notice 'Skipping RLS policy %. Missing table public.%.', policy_spec.policy_name, policy_spec.table_name;
      continue;
    end if;

    if policy_spec.requires_user_id
      and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = policy_spec.table_name
          and column_name = 'user_id'
      )
    then
      raise notice 'Skipping RLS policy %. public.% has no user_id column.', policy_spec.policy_name, policy_spec.table_name;
      continue;
    end if;

    if exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = policy_spec.table_name
        and policyname = policy_spec.policy_name
    ) then
      continue;
    end if;

    if policy_spec.command_name = 'select' then
      execute format(
        'create policy %I on public.%I for select to authenticated using (%s)',
        policy_spec.policy_name,
        policy_spec.table_name,
        policy_spec.using_expression
      );
    elsif policy_spec.command_name = 'insert' then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (%s)',
        policy_spec.policy_name,
        policy_spec.table_name,
        policy_spec.check_expression
      );
    elsif policy_spec.command_name = 'update' then
      execute format(
        'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
        policy_spec.policy_name,
        policy_spec.table_name,
        policy_spec.using_expression,
        policy_spec.check_expression
      );
    elsif policy_spec.command_name = 'delete' then
      execute format(
        'create policy %I on public.%I for delete to authenticated using (%s)',
        policy_spec.policy_name,
        policy_spec.table_name,
        policy_spec.using_expression
      );
    else
      raise exception 'Unsupported RLS policy command: %', policy_spec.command_name;
    end if;
  end loop;
end $$;
