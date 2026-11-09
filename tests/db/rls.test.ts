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
