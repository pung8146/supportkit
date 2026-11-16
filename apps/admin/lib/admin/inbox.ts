import type { SupabaseClient } from '@supabase/supabase-js';

export type InboxView = 'inquiries' | 'unanswered' | 'all';
export const INBOX_VIEWS: InboxView[] = ['inquiries', 'unanswered', 'all'];

export const UNANSWERED_OUTCOMES = ['no_match', 'verify_failed', 'refused', 'error'] as const;

export type InquiryRow = {
  id: string;
  question: string;
  contact: string;
  status: 'new' | 'in_progress' | 'resolved';
  memo: string | null;
  created_at: string;
  expires_at: string | null;
  conversation_id: string | null;
};

export type MessageRow = {
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  outcome: string | null;
  created_at: string;
  sources_snapshot: { title: string }[];
};

type ConversationRow = { id: string; origin: string; last_at: string };

export type ConversationSummary = {
  id: string;
  origin: string;
  lastAt: string;
  firstQuestion: string;
  unanswered: number;
};

const STATUS_ORDER = { new: 0, in_progress: 1, resolved: 2 };
const INQUIRY_COLUMNS = 'id, question, contact, status, memo, created_at, expires_at, conversation_id';

export const isUnanswered = (outcome: string | null) => (UNANSWERED_OUTCOMES as readonly (string | null)[]).includes(outcome);

/** Open inquiries first, newest first within each status. */
export function sortInquiries(rows: InquiryRow[]) {
  return [...rows].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.created_at.localeCompare(a.created_at));
}

export function summarize(conversations: ConversationRow[], messages: Pick<MessageRow, 'conversation_id' | 'role' | 'content' | 'outcome'>[]) {
  return conversations.map<ConversationSummary>((conversation) => {
    const own = messages.filter((message) => message.conversation_id === conversation.id);
    return {
      id: conversation.id,
      origin: conversation.origin,
      lastAt: conversation.last_at,
      firstQuestion: own.find((message) => message.role === 'user')?.content ?? '(질문 없음)',
      unanswered: own.filter((message) => message.role === 'assistant' && isUnanswered(message.outcome)).length,
    };
  });
}

export const originLabel = (origin: string) => {
  if (origin === 'preview') return '미리보기';
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
};

// All queries run with the operator's client, so RLS limits them to their own bot.

export async function loadInquiries(db: SupabaseClient, botId: string) {
  const { data, error } = await db
    .from('inquiries')
    .select(INQUIRY_COLUMNS)
    .eq('bot_id', botId)
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<InquiryRow[]>();
  if (error) throw new Error(`inquiries lookup failed: ${error.message}`);
  return sortInquiries(data ?? []);
}

export async function loadInquiriesFor(db: SupabaseClient, conversationId: string) {
  const { data, error } = await db.from('inquiries').select(INQUIRY_COLUMNS).eq('conversation_id', conversationId).returns<InquiryRow[]>();
  if (error) throw new Error(`inquiries lookup failed: ${error.message}`);
  return data ?? [];
}

export async function loadConversations(db: SupabaseClient, botId: string, onlyUnanswered: boolean) {
  let ids: string[] | undefined;
  if (onlyUnanswered) {
    const { data, error } = await db
      .from('messages')
      .select('conversation_id')
      .eq('bot_id', botId)
      .in('outcome', [...UNANSWERED_OUTCOMES])
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw new Error(`messages lookup failed: ${error.message}`);
    ids = [...new Set((data ?? []).map((row) => row.conversation_id as string))].slice(0, 50);
    if (ids.length === 0) return [];
  }

  let query = db.from('conversations').select('id, origin, last_at').eq('bot_id', botId).order('last_at', { ascending: false }).limit(50);
  if (ids) query = query.in('id', ids);
  const { data: conversations, error } = await query.returns<ConversationRow[]>();
  if (error) throw new Error(`conversations lookup failed: ${error.message}`);
  if (!conversations?.length) return [];

  const { data: messages, error: messagesError } = await db
    .from('messages')
    .select('conversation_id, role, content, outcome')
    .in('conversation_id', conversations.map((conversation) => conversation.id))
    .order('created_at', { ascending: true })
    .limit(2000);
  if (messagesError) throw new Error(`messages lookup failed: ${messagesError.message}`);
  return summarize(conversations, messages ?? []);
}

export async function loadTranscript(db: SupabaseClient, conversationId: string) {
  const { data: conversation, error } = await db
    .from('conversations')
    .select('id, origin, created_at')
    .eq('id', conversationId)
    .maybeSingle<{ id: string; origin: string; created_at: string }>();
  if (error) throw new Error(`conversation lookup failed: ${error.message}`);
  if (!conversation) return null;

  const { data: messages, error: messagesError } = await db
    .from('messages')
    .select('conversation_id, role, content, outcome, created_at, sources_snapshot')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .returns<MessageRow[]>();
  if (messagesError) throw new Error(`messages lookup failed: ${messagesError.message}`);
  return { conversation, messages: messages ?? [] };
}
