import { randomUUID } from 'node:crypto';
import { MAX_MESSAGE_LENGTH, type ChatEvent, type ChatOutcome, type ChatSource } from '@supportkit/widget/protocol';
import { maskPII } from '../../../../lib/answer/mask-pii';
import { answerEvents } from '../../../../lib/answer/pipeline';
import { appendMessage, historyForModel, loadHistory, openConversation } from '../../../../lib/conversations';
import { checkChatQuota } from '../../../../lib/limits';
import { authorizeWidget } from '../../../../lib/widget/auth';
import { fakeEvents } from '../../../../lib/widget/fake-llm';

export const dynamic = 'force-dynamic';

const HISTORY_TURNS = 6;

/** Adds meta and done events around the answer and saves what the visitor finally saw. */
async function* answerAndSave(
  source: AsyncGenerator<ChatEvent, ChatOutcome>,
  conversation: { id: string; ref: string },
  botId: string,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  yield { type: 'meta', messageId: randomUUID(), conversation: conversation.ref };
  let text = '';
  let sources: ChatSource[] = [];
  let outcome: ChatOutcome | 'error' = 'error';
  try {
    let step = await source.next();
    while (!step.done) {
      const event = step.value;
      if (event.type === 'delta') text += event.text;
      if (event.type === 'replace') text = event.text;
      if (event.type === 'sources') sources = event.sources;
      yield event;
      step = await source.next();
    }
    outcome = step.value;
    yield { type: 'done', outcome };
  } catch (error) {
    if (signal.aborted) return;
    console.error(error);
    yield { type: 'error', code: 'provider_failed', message: '답변을 생성하지 못했습니다.' };
  } finally {
    // A stopped answer is not saved; the visitor never saw it complete.
    if (!signal.aborted) {
      await appendMessage({ conversationId: conversation.id, botId, role: 'assistant', content: text, outcome, sources }).catch(
        (error: unknown) => console.error(error),
      );
    }
  }
}

export async function POST(request: Request) {
  const auth = await authorizeWidget(request);
  if (auth instanceof Response) return auth;
  const { token, bot } = auth;

  const body = (await request.json().catch(() => null)) as { message?: unknown; conversation?: unknown } | null;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return Response.json({ error: 'invalid_message' }, { status: 400 });
  }
  const ref = typeof body?.conversation === 'string' ? body.conversation : undefined;

  let limited: string | null;
  try {
    limited = await checkChatQuota(bot, request.headers);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'service_unavailable' }, { status: 503 });
  }
  if (limited) return Response.json({ error: 'rate_limited', message: limited }, { status: 429 });

  let conversation: { id: string; ref: string };
  let history: ReturnType<typeof historyForModel>;
  try {
    // Preview chats are stored apart so the inbox can tell them from real visitors.
    conversation = await openConversation(bot, token.preview ? 'preview' : token.origin, ref);
    history = historyForModel(await loadHistory(conversation.id, HISTORY_TURNS));
    await appendMessage({ conversationId: conversation.id, botId: bot.id, role: 'user', content: maskPII(message) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'service_unavailable' }, { status: 503 });
  }

  const source =
    process.env.LLM_MODE === 'fake' ? fakeEvents(message) : answerEvents(bot, message, history, request.signal);
  const events = answerAndSave(source, conversation, bot.id, request.signal);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
    },
    async cancel() {
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform' },
  });
}
