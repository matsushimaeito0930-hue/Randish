-- Keep the application user table in sync for registrations made directly
-- through Supabase Auth (Web, Expo Go, and future clients).
create or replace function public.sync_auth_user_to_app_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  metadata_display_name text;
  resolved_display_name text;
begin
  metadata_display_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'nickname',
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');
  resolved_display_name := left(coalesce(
    metadata_display_name,
    nullif(split_part(lower(coalesce(new.email, '')), '@', 1), ''),
    'RANDISHユーザー'
  ), 120);

  insert into public.app_users (
    id,
    email,
    display_name,
    password_hash,
    password_salt,
    auth_provider,
    created_at,
    updated_at
  ) values (
    new.id::text,
    lower(new.email),
    resolved_display_name,
    null,
    null,
    'SUPABASE',
    coalesce(new.created_at, current_timestamp),
    current_timestamp
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = case
      when metadata_display_name is not null then excluded.display_name
      else coalesce(public.app_users.display_name, excluded.display_name)
    end,
    auth_provider = 'SUPABASE',
    updated_at = current_timestamp;

  return new;
end;
$$;

revoke all on function public.sync_auth_user_to_app_user() from public;

drop trigger if exists sync_auth_user_to_app_user_trigger on auth.users;
create trigger sync_auth_user_to_app_user_trigger
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_auth_user_to_app_user();

-- Backfill users created before this trigger existed.
insert into public.app_users (
  id,
  email,
  display_name,
  password_hash,
  password_salt,
  auth_provider,
  created_at,
  updated_at
)
select
  users.id::text,
  lower(users.email),
  left(coalesce(
    nullif(trim(coalesce(
      users.raw_user_meta_data ->> 'nickname',
      users.raw_user_meta_data ->> 'display_name',
      users.raw_user_meta_data ->> 'full_name',
      users.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    nullif(split_part(lower(coalesce(users.email, '')), '@', 1), ''),
    'RANDISHユーザー'
  ), 120),
  null,
  null,
  'SUPABASE',
  coalesce(users.created_at, current_timestamp),
  current_timestamp
from auth.users as users
where users.email is not null
on conflict (id) do update set
  email = excluded.email,
  display_name = coalesce(public.app_users.display_name, excluded.display_name),
  auth_provider = 'SUPABASE',
  updated_at = current_timestamp;
