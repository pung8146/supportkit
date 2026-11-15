import type Anthropic from '@anthropic-ai/sdk';
import type { ChatEvent, ChatOutcome } from '@supportkit/widget/protocol';
import { syncPendingKnowledge } from '../knowledge/sync';
import type { Bot } from '../widget/bots';
import { generateAnswer } from './generate';
import { maskPII } from './mask-pii';
import { retrieve } from './retrieve';

export async function* answerEvents(
  bot: Bot,
  question: string,
  history: Anthropic.MessageParam[] = [],
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent, ChatOutcome> {
  const masked = maskPII(question);

  // An embedding outage must not stop answers from knowledge that is already indexed.
  await syncPendingKnowledge(bot.id).catch((error: unknown) => console.error(error));

  // Follow-ups like "제주도는요?" only make sense with the previous question attached.
  const previous = [...history].reverse().find((turn) => turn.role === 'user')?.content;
  const query = typeof previous === 'string' ? `${previous}\n${masked}` : masked;

  const chunks = await retrieve(bot.id, query);
  if (chunks.length === 0) {
    console.info(JSON.stringify({ event: 'answer', botId: bot.id, outcome: 'no_match', llm: false }));
    yield { type: 'delta', text: bot.fallback };
    return 'no_match';
  }

  return yield* generateAnswer({
    botName: bot.config.botName,
    fallback: bot.fallback,
    question: masked,
    chunks,
    history,
    signal,
    onDone: (outcome, usage) =>
      console.info(JSON.stringify({ event: 'answer', botId: bot.id, outcome, input: usage.input_tokens, output: usage.output_tokens })),
  });
}
