import type { ChatEvent } from '../protocol';

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

/** Posts one question, refreshing the short-lived token once on 401. */
export async function openChat(message: string, auth: TokenSource, signal: AbortSignal) {
  const post = () =>
    fetch('/api/widget/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.token()}` },
      body: JSON.stringify({ message }),
      signal,
    });

  let response = await post();
  if (response.status === 401) {
    await auth.refresh();
    response = await post();
  }
  if (!response.ok || !response.body) throw new Error(`chat failed: ${response.status}`);
  return parseSSE(response.body);
}
