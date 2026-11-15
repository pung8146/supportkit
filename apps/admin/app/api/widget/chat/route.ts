import { MAX_MESSAGE_LENGTH, type ChatEvent } from '@supportkit/widget/protocol';
import { answerEvents } from '../../../../lib/answer/pipeline';
import { findBotById } from '../../../../lib/widget/bots';
import { fakeEvents } from '../../../../lib/widget/fake-llm';
import { originAllowed } from '../../../../lib/widget/origin';
import { tokenSecret, verifyToken } from '../../../../lib/widget/token';

export const dynamic = 'force-dynamic';

async function* withDone(events: AsyncGenerator<ChatEvent>, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  try {
    yield* events;
    yield { type: 'done' };
  } catch (error) {
    if (signal.aborted) return;
    console.error(error);
    yield { type: 'error', code: 'provider_failed', message: '답변을 생성하지 못했습니다.' };
  }
}

export async function POST(request: Request) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '');
  const token = bearer ? verifyToken(bearer, tokenSecret()) : null;
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const bot = await findBotById(token.botId).catch((error: unknown) => {
    console.error(error);
    return undefined;
  });
  if (bot === undefined) return Response.json({ error: 'service_unavailable' }, { status: 503 });

  // Rechecked per request so removing a domain takes effect before the token expires.
  if (!bot || !originAllowed(token.origin, bot.allowedOrigins)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return Response.json({ error: 'invalid_message' }, { status: 400 });
  }

  const source = process.env.LLM_MODE === 'fake' ? fakeEvents(message) : answerEvents(bot, message, request.signal);
  const events = withDone(source, request.signal);
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
