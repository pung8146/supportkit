import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const env = Object.fromEntries(
  execSync('corepack pnpm exec supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split(/\r?\n/)
    .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line))
    .flatMap((match) => (match ? [[match[1], match[2]]] : [])),
) as Record<string, string>;

const url = env.API_URL!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, env.SERVICE_ROLE_KEY!, options);
const anon = createClient(url, env.ANON_KEY!, options);

type Tenant = { id: string; client: SupabaseClient; botId: string };

async function createTenant(label: string): Promise<Tenant> {
  const email = `${label}-${randomUUID()}@example.test`;
  const password = randomUUID();
  const { data: created, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;

  const client = createClient(url, env.ANON_KEY!, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const id = created.user.id;
  const { data: bot, error: botError } = await client.from('bots').insert({ owner_id: id, name: label }).select('id').single();
  if (botError) throw botError;
  return { id, client, botId: bot.id };
}

const rows = (result: { data: unknown[] | null }) => result.data ?? [];

let a: Tenant;
let b: Tenant;
let conversationId: string;
let inquiryId: string;
let itemId: string;

beforeAll(async () => {
  a = await createTenant('tenant-a');
  b = await createTenant('tenant-b');

  const item = await a.client
    .from('knowledge_items')
    .insert({ bot_id: a.botId, kind: 'faq', title: '환불', body: '7일 이내' })
    .select('id')
    .single();
  if (item.error) throw item.error;
  itemId = item.data.id;

  const conversation = await service
    .from('conversations')
    .insert({ bot_id: a.botId, visitor_hash: 'v', origin: 'https://a.test', expires_at: '2100-01-01' })
    .select('id')
    .single();
  if (conversation.error) throw conversation.error;
  conversationId = conversation.data.id;

  const message = await service
    .from('messages')
    .insert({ conversation_id: conversationId, bot_id: a.botId, role: 'user', content: 'hello' });
  if (message.error) throw message.error;

  const inquiry = await service
    .from('inquiries')
    .insert({ bot_id: a.botId, question: 'q', contact: 'c', consent_version: 'v1', consented_at: '2026-01-01' })
    .select('id')
    .single();
  if (inquiry.error) throw inquiry.error;
  inquiryId = inquiry.data.id;

  const chunk = await service.from('chunks').insert({
    item_id: itemId,
    bot_id: a.botId,
    version: 1,
    content: '7일 이내',
    embedding: JSON.stringify(Array(1536).fill(0.1)),
  });
  if (chunk.error) throw chunk.error;
});

afterAll(async () => {
  for (const tenant of [a, b]) if (tenant) await service.auth.admin.deleteUser(tenant.id);
});

const ownedTables = ['knowledge_items', 'conversations', 'messages', 'inquiries'] as const;

describe('tenant isolation', () => {
  it.each(ownedTables)('owner reads their own %s', async (table) => {
    expect(rows(await a.client.from(table).select('id').eq('bot_id', a.botId))).toHaveLength(1);
  });

  it.each(ownedTables)("another tenant cannot read %s", async (table) => {
    expect(rows(await b.client.from(table).select('id').eq('bot_id', a.botId))).toEqual([]);
  });

  it("another tenant cannot see, rename or delete a bot", async () => {
    expect(rows(await b.client.from('bots').select('id').eq('id', a.botId))).toEqual([]);
    await b.client.from('bots').update({ name: 'hijacked' }).eq('id', a.botId);
    await b.client.from('bots').delete().eq('id', a.botId);

    const { data } = await service.from('bots').select('name').eq('id', a.botId).single();
    expect(data?.name).toBe('tenant-a');
  });

  it('cannot create a bot owned by someone else', async () => {
    const { error } = await b.client.from('bots').insert({ owner_id: a.id, name: 'planted' });
    expect(error).not.toBeNull();
  });

  it("cannot add knowledge to another tenant's bot", async () => {
    const { error } = await b.client
      .from('knowledge_items')
      .insert({ bot_id: a.botId, kind: 'faq', title: 'x', body: 'poison' });
    expect(error).not.toBeNull();
  });

  it("cannot edit another tenant's knowledge or move it to their own bot", async () => {
    await b.client.from('knowledge_items').update({ body: 'poison' }).eq('id', itemId);
    const moved = await a.client.from('knowledge_items').update({ bot_id: b.botId }).eq('id', itemId);
    expect(moved.error).not.toBeNull();

    const { data } = await service.from('knowledge_items').select('body, bot_id').eq('id', itemId).single();
    expect(data).toEqual({ body: '7일 이내', bot_id: a.botId });
  });

  it("cannot change another tenant's inquiry", async () => {
    await b.client.from('inquiries').update({ status: 'resolved' }).eq('id', inquiryId);
    const { data } = await service.from('inquiries').select('status').eq('id', inquiryId).single();
    expect(data?.status).toBe('new');
  });
});

describe('server-only data', () => {
  it.each([{ monthly_limit: 999999 }, { is_demo: true }, { expires_at: '2100-01-01' }, { public_key: 'pk_custom' }])(
    'owner cannot set %j',
    async (change) => {
      const { error } = await a.client.from('bots').update(change).eq('id', a.botId);
      expect(error).not.toBeNull();
    },
  );

  it('owner can change settings they control', async () => {
    const { error } = await a.client.from('bots').update({ welcome: '반갑습니다' }).eq('id', a.botId);
    expect(error).toBeNull();
  });

  it('owner can change inquiry status but not the submitted contact', async () => {
    expect((await a.client.from('inquiries').update({ status: 'in_progress' }).eq('id', inquiryId)).error).toBeNull();
    expect((await a.client.from('inquiries').update({ contact: 'changed' }).eq('id', inquiryId)).error).not.toBeNull();
  });

  it('owner cannot read embeddings or fabricate conversations', async () => {
    expect(rows(await a.client.from('chunks').select('id'))).toEqual([]);
    const { error } = await a.client
      .from('conversations')
      .insert({ bot_id: a.botId, visitor_hash: 'x', origin: 'https://x.test', expires_at: '2100-01-01' });
    expect(error).not.toBeNull();
  });
});

describe('anonymous access', () => {
  it.each(['bots', 'knowledge_items', 'chunks', 'conversations', 'messages', 'inquiries'])('anon reads nothing from %s', async (table) => {
    expect(rows(await anon.from(table).select('id'))).toEqual([]);
  });

  it('anon cannot create a bot', async () => {
    expect((await anon.from('bots').insert({ name: 'spam' })).error).not.toBeNull();
  });

  it('the system demo bot is invisible to signed-in tenants', async () => {
    expect(rows(await a.client.from('bots').select('id').eq('public_key', 'pk_demo_shop'))).toEqual([]);
  });
});

const vector = (hot: number) => JSON.stringify(Array.from({ length: 1536 }, (_, index) => (index === hot ? 1 : 0)));

async function insertItem(botId: string, title: string) {
  const { data, error } = await service
    .from('knowledge_items')
    .insert({ bot_id: botId, kind: 'faq', title, body: 'body' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

const replaceChunks = (itemId: string, version: number, contents: string[], vectors: string[]) =>
  service.rpc('replace_item_chunks', { p_item_id: itemId, p_version: version, p_contents: contents, p_embeddings: vectors });

const match = (botId: string, hot: number) =>
  service.rpc('match_chunks', { p_bot_id: botId, p_embedding: vector(hot), p_count: 20 });

describe('retrieval functions', () => {
  it('cannot be called by signed-in or anonymous users', async () => {
    for (const client of [a.client, anon]) {
      expect((await client.rpc('match_chunks', { p_bot_id: a.botId, p_embedding: vector(0), p_count: 5 })).error).not.toBeNull();
      const replaced = await client.rpc('replace_item_chunks', {
        p_item_id: itemId,
        p_version: 1,
        p_contents: ['x'],
        p_embeddings: [vector(0)],
      });
      expect(replaced.error).not.toBeNull();
    }
  });

  it('owner cannot mark knowledge as indexed', async () => {
    expect((await a.client.from('knowledge_items').update({ status: 'ready' }).eq('id', itemId)).error).not.toBeNull();
  });

  it('ranks by similarity and never returns another bot\'s chunks', async () => {
    const ownItem = await insertItem(a.botId, '배송');
    const otherItem = await insertItem(b.botId, '배송');
    expect((await replaceChunks(ownItem, 1, ['near', 'far'], [vector(1), vector(2)])).data).toBe(true);
    expect((await replaceChunks(otherItem, 1, ['other bot'], [vector(1)])).data).toBe(true);

    const { data, error } = await match(a.botId, 1);
    expect(error).toBeNull();
    expect(data[0]).toMatchObject({ content: 'near', item_id: ownItem });
    expect(data[0].similarity).toBeCloseTo(1);
    expect(data.some((row: { item_id: string }) => row.item_id === otherItem)).toBe(false);

    const { data: item } = await service.from('knowledge_items').select('status').eq('id', ownItem).single();
    expect(item?.status).toBe('ready');
  });

  it('hides chunks of an edited item until the new version is embedded', async () => {
    const id = await insertItem(a.botId, '환불');
    await replaceChunks(id, 1, ['refund policy v1'], [vector(3)]);

    await a.client.from('knowledge_items').update({ body: 'refund policy v2' }).eq('id', id);
    const { data: edited } = await service.from('knowledge_items').select('version, status').eq('id', id).single();
    expect(edited).toEqual({ version: 2, status: 'pending' });

    const contents = async () => ((await match(a.botId, 3)).data as { content: string }[]).map((row) => row.content);
    expect(await contents()).not.toContain('refund policy v1');

    // An embedding of the old text that finishes late must not overwrite the edit.
    expect((await replaceChunks(id, 1, ['refund policy v1'], [vector(3)])).data).toBe(false);
    expect((await replaceChunks(id, 2, ['refund policy v2'], [vector(3)])).data).toBe(true);
    expect(await contents()).toContain('refund policy v2');
  });

  it('rejects mismatched contents and embeddings', async () => {
    expect((await replaceChunks(itemId, 1, ['a', 'b'], [vector(0)])).error).not.toBeNull();
  });
});

describe('demo and install rules', () => {
  it('an anonymous user cannot create a bot through the API', async () => {
    const visitor = createClient(url, env.ANON_KEY!, options);
    const { data, error } = await visitor.auth.signInAnonymously();
    if (error) throw error;
    try {
      const insert = await visitor.from('bots').insert({ owner_id: data.user!.id, name: 'spam', allowed_origins: ['https://evil.test'] });
      expect(insert.error).not.toBeNull();
    } finally {
      await service.auth.admin.deleteUser(data.user!.id);
    }
  });

  it('a demo bot cannot get allowed origins from its owner or the server', async () => {
    const { data: demo, error } = await service.from('bots').insert({ owner_id: a.id, name: 'demo', is_demo: true }).select('id').single();
    if (error) throw error;
    expect((await a.client.from('bots').update({ allowed_origins: ['https://evil.test'] }).eq('id', demo.id)).error).not.toBeNull();
    expect((await service.from('bots').update({ allowed_origins: ['https://evil.test'] }).eq('id', demo.id)).error).not.toBeNull();
  });

  it('a regular owner can set allowed origins', async () => {
    expect((await a.client.from('bots').update({ allowed_origins: ['https://shop.test'] }).eq('id', a.botId)).error).toBeNull();
  });

  it('resolving an inquiry starts a 90-day contact clock and reopening stops it', async () => {
    await a.client.from('inquiries').update({ status: 'resolved' }).eq('id', inquiryId);
    const { data: resolved } = await service.from('inquiries').select('expires_at').eq('id', inquiryId).single();
    const days = (Date.parse(resolved!.expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThan(90.1);

    await a.client.from('inquiries').update({ status: 'in_progress' }).eq('id', inquiryId);
    const { data: reopened } = await service.from('inquiries').select('expires_at').eq('id', inquiryId).single();
    expect(reopened!.expires_at).toBeNull();
  });

  it('the owner cannot set the deletion date directly', async () => {
    expect((await a.client.from('inquiries').update({ expires_at: '2100-01-01' }).eq('id', inquiryId)).error).not.toBeNull();
  });
});

describe('quotas', () => {
  const take = (key: string, limit: number) =>
    service.rpc('consume_quota', { p_key: key, p_limit: limit, p_ttl_seconds: 60 }).then(({ data, error }) => {
      if (error) throw error;
      return data as boolean;
    });

  it('counts up to the limit and refuses after it', async () => {
    const key = `test:${randomUUID()}`;
    expect([await take(key, 2), await take(key, 2), await take(key, 2)]).toEqual([true, true, false]);
  });

  it('refuses everything at a zero limit', async () => {
    expect(await take(`test:${randomUUID()}`, 0)).toBe(false);
  });

  it('allows exactly the limit under concurrent requests', async () => {
    const key = `test:${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 20 }, () => take(key, 5)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it('cannot be called or read by signed-in users', async () => {
    expect((await a.client.rpc('consume_quota', { p_key: 'x', p_limit: 1000, p_ttl_seconds: 60 })).error).not.toBeNull();
    expect((await a.client.rpc('cleanup_expired')).error).not.toBeNull();
    expect(rows(await a.client.from('rate_buckets').select('key'))).toEqual([]);
  });
});

describe('cleanup', () => {
  it('deletes only data past its retention', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const conversation = (expires_at: string) =>
      service.from('conversations').insert({ bot_id: a.botId, visitor_hash: 'v', origin: 'https://a.test', expires_at }).select('id').single();
    const { data: oldConversation } = await conversation(past);
    const { data: liveConversation } = await conversation(future);
    await service.from('messages').insert({ conversation_id: oldConversation!.id, bot_id: a.botId, role: 'user', content: 'old' });

    const inquiry = (expires_at: string | null) =>
      service
        .from('inquiries')
        .insert({ bot_id: a.botId, question: 'q', contact: 'c', consent_version: 'v1', consented_at: past, status: 'resolved', expires_at })
        .select('id')
        .single();
    const { data: oldInquiry } = await inquiry(past);
    const { data: liveInquiry } = await inquiry(future);

    const demo = (expires_at: string) => service.from('bots').insert({ owner_id: b.id, name: 'demo', is_demo: true, expires_at }).select('id').single();
    const { data: oldDemo } = await demo(past);
    const { data: liveDemo } = await demo(future);

    const { data: report, error } = await service.rpc('cleanup_expired');
    expect(error).toBeNull();
    expect(report.conversations).toBeGreaterThanOrEqual(1);

    const exists = async (table: string, id: string) => rows(await service.from(table).select('id').eq('id', id)).length === 1;
    expect(await exists('conversations', oldConversation!.id)).toBe(false);
    expect(rows(await service.from('messages').select('id').eq('conversation_id', oldConversation!.id))).toEqual([]);
    expect(await exists('conversations', liveConversation!.id)).toBe(true);
    expect(await exists('inquiries', oldInquiry!.id)).toBe(false);
    expect(await exists('inquiries', liveInquiry!.id)).toBe(true);
    expect(await exists('bots', oldDemo!.id)).toBe(false);
    expect(await exists('bots', liveDemo!.id)).toBe(true);
    expect(await exists('bots', a.botId)).toBe(true);
  });
});

describe('cross-bot integrity', () => {
  it('rejects a message that mixes two bots', async () => {
    const { error } = await service
      .from('messages')
      .insert({ conversation_id: conversationId, bot_id: b.botId, role: 'user', content: 'mixed' });
    expect(error).not.toBeNull();
  });

  it('rejects a chunk that mixes two bots', async () => {
    const { error } = await service.from('chunks').insert({
      item_id: itemId,
      bot_id: b.botId,
      version: 1,
      content: 'mixed',
      embedding: JSON.stringify(Array(1536).fill(0.1)),
    });
    expect(error).not.toBeNull();
  });

  it('deleting a conversation keeps the inquiry row', async () => {
    const { error } = await service
      .from('inquiries')
      .update({ conversation_id: conversationId })
      .eq('id', inquiryId);
    expect(error).toBeNull();

    await a.client.from('conversations').delete().eq('id', conversationId);

    const { data } = await service.from('inquiries').select('conversation_id, bot_id').eq('id', inquiryId).single();
    expect(data).toEqual({ conversation_id: null, bot_id: a.botId });
  });
});
