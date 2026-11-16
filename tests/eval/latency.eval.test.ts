// Billed (embeddings + Claude Haiku 5.5, well under a cent). Server-side time to the first answer
// token for the real path: sync check, embedding, retrieval and the model's first text.
import { expect, it } from 'vitest';
import { answerEvents } from '../../apps/admin/lib/answer/pipeline';
import { findBotByPublicKey } from '../../apps/admin/lib/widget/bots';

process.loadEnvFile('apps/admin/.env.local');

it('reports time to first answer token', async () => {
  const bot = await findBotByPublicKey('pk_demo_shop');
  if (!bot) throw new Error('run `supabase db reset` to seed the demo bot');

  const samples: number[] = [];
  for (const question of ['환불은 며칠 안에 되나요?', '배송비 얼마예요?', '그릇이 깨져서 왔어요', '화병은 언제 받아요?', '상담 몇 시까지 해요?']) {
    const started = performance.now();
    for await (const event of answerEvents(bot, question)) {
      if (event.type === 'delta') {
        samples.push(Math.round(performance.now() - started));
        break;
      }
    }
  }
  samples.sort((a, b) => a - b);
  console.info(JSON.stringify({ firstTokenMs: samples, median: samples[2] }));
  expect(samples).toHaveLength(5);
});
