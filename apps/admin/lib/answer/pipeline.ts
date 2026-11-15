import { randomUUID } from 'node:crypto';
import type { ChatEvent } from '@supportkit/widget/protocol';
import { syncPendingKnowledge } from '../knowledge/sync';
import type { Bot } from '../widget/bots';
import { generateAnswer } from './generate';
import { maskPII } from './mask-pii';
import { retrieve } from './retrieve';

export async function* answerEvents(bot: Bot, question: string, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  yield { type: 'meta', messageId: randomUUID() };
  const masked = maskPII(question);

  // An embedding outage must not stop answers from knowledge that is already indexed.
  await syncPendingKnowledge(bot.id).catch((error: unknown) => console.error(error));

  const chunks = await retrieve(bot.id, masked);
  if (chunks.length === 0) {
    console.info(JSON.stringify({ event: 'answer', botId: bot.id, outcome: 'no_match', llm: false }));
    yield { type: 'delta', text: bot.fallback };
    return;
  }

  yield* generateAnswer({
    botName: bot.config.botName,
    fallback: bot.fallback,
    question: masked,
    chunks,
    signal,
    onDone: (outcome, usage) =>
      console.info(JSON.stringify({ event: 'answer', botId: bot.id, outcome, input: usage.input_tokens, output: usage.output_tokens })),
  });
}
