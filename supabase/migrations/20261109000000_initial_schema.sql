create extension if not exists vector with schema extensions;

create table public.bots (
  id uuid primary key default gen_random_uuid(),
  -- null owner: system-owned demo bot, unreachable through RLS
  owner_id uuid references auth.users (id) on delete cascade,
  public_key text not null unique default 'pk_' || replace(gen_random_uuid()::text, '-', ''),
  name text not null check (char_length(name) between 1 and 60),
  launcher_label text not null default '문의하기' check (char_length(launcher_label) between 1 and 20),
  welcome text not null default '안녕하세요. 무엇을 도와드릴까요?',
  starters text[] not null default '{}',
  theme jsonb not null default '{"accent": "#1f4d3f", "position": "right"}',
  allowed_origins text[] not null default '{}',
  fallback text not null default '등록된 안내에서 답을 찾지 못했어요. 문의를 남겨 주시면 담당자가 확인해 드릴게요.',
  retention_days integer not null default 90 check (retention_days in (30, 90, 180)),
  monthly_limit integer not null default 1000 check (monthly_limit >= 0),
  is_demo boolean not null default false,
  expires_at timestamptz,
  last_seen_origin text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index bots_owner_idx on public.bots (owner_id);

create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  kind text not null check (kind in ('faq', 'text')),
  title text not null,
  body text not null,
  version integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  unique (id, bot_id)
);
create index knowledge_items_bot_idx on public.knowledge_items (bot_id);

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  bot_id uuid not null,
  version integer not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  -- composite key: a chunk can never point at another bot's item
  foreign key (item_id, bot_id) references public.knowledge_items (id, bot_id) on delete cascade
);
-- shortcut: exact scan per bot, add HNSW if a bot grows past a few thousand chunks
create index chunks_bot_idx on public.chunks (bot_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  visitor_hash text not null,
  origin text not null,
  last_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (id, bot_id)
);
create index conversations_bot_idx on public.conversations (bot_id, last_at desc);
create index conversations_expiry_idx on public.conversations (expires_at);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  bot_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  outcome text check (outcome in ('answered', 'no_match', 'verify_failed', 'error')),
  sources_snapshot jsonb not null default '[]',
  usage jsonb,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, bot_id) references public.conversations (id, bot_id) on delete cascade
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_bot_outcome_idx on public.messages (bot_id, outcome, created_at desc);

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  conversation_id uuid,
  question text not null,
  contact text not null,
  consent_version text not null,
  consented_at timestamptz not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  memo text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, bot_id) references public.conversations (id, bot_id) on delete set null (conversation_id)
);
create index inquiries_bot_idx on public.inquiries (bot_id, status, created_at desc);

-- Access control. The widget never talks to Postgres directly: anon gets nothing,
-- and public API routes use service_role with a bot id taken from a verified token.
create schema private;
grant usage on schema private to authenticated;

create function private.owns_bot(target uuid) returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (select 1 from public.bots where id = target and owner_id = (select auth.uid()));
$$;

alter table public.bots enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.inquiries enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

-- Limits and demo flags are server-set: a demo visitor must not be able to raise them.
grant select, delete on public.bots to authenticated;
grant insert (owner_id, name, launcher_label, welcome, starters, theme, allowed_origins, fallback, retention_days)
  on public.bots to authenticated;
grant update (name, launcher_label, welcome, starters, theme, allowed_origins, fallback, retention_days)
  on public.bots to authenticated;
create policy bots_owner on public.bots for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.knowledge_items to authenticated;
create policy knowledge_items_owner on public.knowledge_items for all to authenticated
  using (private.owns_bot(bot_id))
  with check (private.owns_bot(bot_id));

grant select, delete on public.conversations to authenticated;
create policy conversations_owner on public.conversations for all to authenticated
  using (private.owns_bot(bot_id));

grant select on public.messages to authenticated;
create policy messages_owner on public.messages for select to authenticated
  using (private.owns_bot(bot_id));

grant select, delete on public.inquiries to authenticated;
grant update (status, memo) on public.inquiries to authenticated;
create policy inquiries_owner on public.inquiries for all to authenticated
  using (private.owns_bot(bot_id))
  with check (private.owns_bot(bot_id));

-- chunks has RLS on and no policy: only service_role reads or writes embeddings.
