-- Backend/admin-only directory for reviewing manually granted Premium members.
-- Keep app_users as the single source of truth for email addresses instead of
-- duplicating mutable email data in premium_grants.

create or replace view public.premium_grant_members
with (security_invoker = true)
as
select
  grant_record.id as grant_id,
  member.id as user_id,
  member.email,
  member.display_name,
  grant_record.entitlement_key,
  grant_record.grant_type,
  grant_record.status,
  grant_record.starts_at,
  grant_record.ends_at,
  grant_record.note,
  grant_record.created_at,
  grant_record.updated_at
from public.premium_grants grant_record
join public.app_users member
  on member.id = grant_record.user_id;

revoke all on table public.premium_grant_members from anon, authenticated;
