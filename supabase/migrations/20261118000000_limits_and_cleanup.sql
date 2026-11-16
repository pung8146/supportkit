-- Counters for rate limits and quotas. The window is part of the key (e.g. "ip-chat:<hash>:2026-11-18T03"),
-- so one atomic upsert both counts and checks; expires_at only tells cleanup when a row is useless.
create table public.rate_buckets (
  key text primary key,
  count integer not null,
  expires_at timestamptz not null
);
alter table public.rate_buckets enable row level security;
revoke all on public.rate_buckets from anon, authenticated;
grant all on public.rate_buckets to service_role;

-- Returns true and counts the request if the key is under its limit; false otherwise (and does not count it).
create function public.consume_quota(p_key text, p_limit integer, p_ttl_seconds integer) returns boolean
language plpgsql set search_path = ''
as $$
declare
  allowed boolean;
begin
  if p_limit <= 0 then
    return false;
  end if;
  insert into public.rate_buckets as bucket (key, count, expires_at)
  values (p_key, 1, now() + make_interval(secs => p_ttl_seconds))
  on conflict (key) do update set count = bucket.count + 1 where bucket.count < p_limit
  returning true into allowed;
  return coalesce(allowed, false);
end;
$$;

-- Deletes everything past its retention: conversations (and their messages), inquiry contacts 90 days
-- after resolution, expired demo bots, anonymous demo accounts left without a bot, and stale counters.
create function public.cleanup_expired() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  conversations_deleted integer;
  inquiries_deleted integer;
  demo_bots_deleted integer;
  anonymous_users_deleted integer;
  buckets_deleted integer;
begin
  delete from public.conversations where expires_at < now();
  get diagnostics conversations_deleted = row_count;
  delete from public.inquiries where expires_at < now();
  get diagnostics inquiries_deleted = row_count;
  delete from public.bots where is_demo and expires_at < now();
  get diagnostics demo_bots_deleted = row_count;
  delete from auth.users u
  where u.is_anonymous
    and u.created_at < now() - interval '1 day'
    and not exists (select 1 from public.bots b where b.owner_id = u.id);
  get diagnostics anonymous_users_deleted = row_count;
  delete from public.rate_buckets where expires_at < now();
  get diagnostics buckets_deleted = row_count;

  return jsonb_build_object(
    'conversations', conversations_deleted,
    'inquiries', inquiries_deleted,
    'demo_bots', demo_bots_deleted,
    'anonymous_users', anonymous_users_deleted,
    'rate_buckets', buckets_deleted
  );
end;
$$;

revoke execute on function public.consume_quota(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.cleanup_expired() from public, anon, authenticated;
grant execute on function public.consume_quota(text, integer, integer) to service_role;
grant execute on function public.cleanup_expired() to service_role;

create extension if not exists pg_cron;
select cron.schedule('supportkit-cleanup', '17 18 * * *', 'select public.cleanup_expired()'); -- 03:17 KST
