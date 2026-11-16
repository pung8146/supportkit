-- Install detection: where the widget last loaded, and the last origin it was refused on.
alter table public.bots
  add column last_blocked_origin text,
  add column last_blocked_at timestamptz;

-- Anonymous demo users get a bot only through the server's demo clone. A browser session can
-- call the REST API directly, so this is enforced here rather than in the server action.
create policy bots_no_anonymous_insert on public.bots as restrictive for insert to authenticated
  with check (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false);

-- Demo bots must never run on external sites, whoever edits them.
create function private.lock_demo_origins() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.is_demo and cardinality(new.allowed_origins) > 0 then
    raise exception 'demo bots cannot be installed on external sites';
  end if;
  return new;
end;
$$;

create trigger bots_lock_demo_origins
before insert or update on public.bots
for each row execute function private.lock_demo_origins();

-- A resolved inquiry keeps the visitor's contact for 90 days; reopening stops the clock.
create function private.inquiry_expiry() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.expires_at := now() + interval '90 days';
  elsif new.status <> 'resolved' then
    new.expires_at := null;
  end if;
  return new;
end;
$$;

create trigger inquiries_expiry
before update of status on public.inquiries
for each row execute function private.inquiry_expiry();
