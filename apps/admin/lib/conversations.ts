import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ChatOutcome, ChatSource, ConversationRef, HistoryMessage } from '@supportkit/widget/protocol';
import { serviceClient } from './db';
import type { Bot } from './widget/bots';

const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

type Row = { id: string; visitor_hash: string; expires_at: string; last_at: string };

/** Resolves a visitor's ref to their conversation, or null when it is unknown, forged or expired. */
export async function findConversation(bot: Bot, ref: string, options: { restoreWindow?: boolean } = {}) {
  const [id, secret, extra] = ref.split('.');
  if (!id || !secret || extra !== undefined || !UUID.test(id)) return null;

  const { data, error } = await serviceClient()
    .from('conversations')
    .select('id, visitor_hash, expires_at, last_at')
    .eq('id', id)
    .eq('bot_id', bot.id)
    .maybeSingle<Row>();
  if (error) throw new Error(`conversation lookup failed: ${error.message}`);
  if (!data) return null;

  const stored = Buffer.from(data.visitor_hash, 'hex');
  const given = sha256(secret);
  if (stored.length !== given.length || !timingSafeEqual(stored, given)) return null;
  if (Date.parse(data.expires_at) <= Date.now()) return null;
  if (options.restoreWindow && Date.now() - Date.parse(data.last_at) > RESTORE_WINDOW_MS) return null;
  return { id: data.id };
}

/** Continues the visitor's conversation when the ref is valid, otherwise starts a new one. */
export async function openConversation(bot: Bot, origin: string, ref?: string): Promise<{ id: string; ref: ConversationRef }> {
  const db = serviceClient();
  if (ref) {
    const found = await findConversation(bot, ref);
    if (found) {
      await db.from('conversations').update({ last_at: new Date().toISOString() }).eq('id', found.id);
      return { id: found.id, ref };
    }
  }

  const secret = randomBytes(24).toString('base64url');
  const { data, error } = await db
    .from('conversations')
    .insert({
      bot_id: bot.id,
      visitor_hash: sha256(secret).toString('hex'),
      origin,
      expires_at: new Date(Date.now() + bot.retentionDays * 86_400_000).toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`conversation create failed: ${error.message}`);
  return { id: data.id, ref: `${data.id}.${secret}` };
}

export async function loadHistory(conversationId: string, limit: number): Promise<HistoryMessage[]> {
  const { data, error } = await serviceClient()
    .from('messages')
    .select('role, content, sources_snapshot, outcome')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`history lookup failed: ${error.message}`);
  return (data ?? []).reverse().map((row) => ({
    role: row.role,
    text: row.content,
    sources: row.sources_snapshot as ChatSource[],
    outcome: row.outcome,
  }));
}

/** Prior turns for the model: no empty failed answers, and the first turn must be the visitor's. */
export function historyForModel(history: HistoryMessage[]) {
  const turns = history.filter((message) => message.text.trim());
  while (turns[0]?.role === 'assistant') turns.shift();
  return turns.map((message) => ({ role: message.role, content: message.text }));
}

export async function appendMessage(message: {
  conversationId: string;
  botId: string;
  role: 'user' | 'assistant';
  content: string;
  outcome?: ChatOutcome | 'error';
  sources?: ChatSource[];
}) {
  const { error } = await serviceClient().from('messages').insert({
    conversation_id: message.conversationId,
    bot_id: message.botId,
    role: message.role,
    content: message.content,
    outcome: message.outcome ?? null,
    sources_snapshot: message.sources ?? [],
  });
  if (error) throw new Error(`message save failed: ${error.message}`);
}
