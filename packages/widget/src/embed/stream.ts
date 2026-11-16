import type { InquiryInput } from '../inquiry';
import type { ChatEvent, HistoryMessage } from '../protocol';

export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      // stream: true keeps Korean characters split across network chunks intact.
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        if (frame.startsWith('data: ')) yield JSON.parse(frame.slice(6)) as ChatEvent;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export type TokenSource = { token: () => string; refresh: () => Promise<void> };

/** POSTs JSON with the short-lived widget token, refreshing it once on 401. */
async function post(path: string, body: unknown, auth: TokenSource, signal?: AbortSignal) {
  const send = () =>
    fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.token()}` },
      body: JSON.stringify(body),
      signal,
    });

  let response = await send();
  if (response.status === 401) {
    await auth.refresh();
    response = await send();
  }
  return response;
}

/** The server refused the question for quota reasons; `message` is written for the visitor. */
export class LimitError extends Error {}

export async function openChat(message: string, conversation: string | undefined, auth: TokenSource, signal: AbortSignal) {
  const response = await post('/api/widget/chat', { message, conversation }, auth, signal);
  if (response.status === 429) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new LimitError(body?.message ?? '지금은 질문을 더 받을 수 없어요. 잠시 후 다시 시도해 주세요.');
  }
  if (!response.ok || !response.body) throw new Error(`chat failed: ${response.status}`);
  return parseSSE(response.body);
}

/** Null when the conversation is gone or too old; throws on other failures. */
export async function restoreConversation(conversation: string, auth: TokenSource): Promise<HistoryMessage[] | null> {
  const response = await post('/api/widget/conversation', { conversation }, auth);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`restore failed: ${response.status}`);
  return ((await response.json()) as { messages: HistoryMessage[] }).messages;
}

export async function submitInquiry(input: InquiryInput & { conversation?: string }, auth: TokenSource) {
  const response = await post('/api/widget/inquiries', input, auth);
  if (!response.ok) throw new Error(`inquiry failed: ${response.status}`);
}
