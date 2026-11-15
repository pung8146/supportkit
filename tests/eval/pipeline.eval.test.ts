// Billed (embeddings + Claude Haiku 5.5, about a cent). Runs the real path visitors hit:
// sync, retrieval, gate, generation and verification, on the questions retrieval finds hardest.
import { describe, expect, it } from 'vitest';
import { answerEvents } from '../../apps/admin/lib/answer/pipeline';
import { verifyFigures } from '../../apps/admin/lib/answer/verify-figures';
import { findBotByPublicKey } from '../../apps/admin/lib/widget/bots';

process.loadEnvFile('apps/admin/.env.local');

const KNOWLEDGE = [
  '평일 오후 2시 이전 주문은 당일 출고되며, 보통 1~2일 안에 도착합니다. 주말과 공휴일에는 출고하지 않습니다.',
  '배송비는 3,000원이며, 5만원 이상 주문하시면 무료로 배송해 드립니다. 제주와 도서산간 지역은 3,000원이 추가됩니다.',
  '상품을 받은 날부터 7일 이내에 환불을 신청하실 수 있습니다. 사용하지 않은 상품만 환불할 수 있으며, 단순 변심일 때 왕복 배송비 6,000원은 고객님이 부담합니다.',
  '상품을 받은 날부터 3일 이내에 파손 부위 사진과 함께 문의를 남겨 주세요. 확인 후 같은 상품으로 교환해 드리며, 배송비는 공방이 부담합니다.',
  '옹기 화병은 주문 후 제작하며, 결제일로부터 영업일 기준 10일 안에 출고됩니다. 주문 제작 상품은 단순 변심으로 환불할 수 없습니다.',
  '문의 답변은 평일 오전 10시부터 오후 5시까지 드립니다. 점심시간은 낮 12시부터 1시까지입니다.',
];

async function ask(question: string) {
  const bot = await findBotByPublicKey('pk_demo_shop');
  if (!bot) throw new Error('run `supabase db reset` to seed the demo bot');
  let text = '';
  for await (const event of answerEvents(bot, question)) {
    if (event.type === 'delta') text += event.text;
    if (event.type === 'replace') text = event.text;
  }
  console.info(`${question}\n  -> ${text}`);
  return { text, fallback: bot.fallback };
}

describe('answers covered questions that retrieval ranks low', () => {
  it.each([
    ['반품하고 싶어요', /7일/],
    ['마음이 바뀌었는데 돈 돌려받을 수 있나요', /7일/],
    ['컵에 금이 가서 왔어요', /3일/],
    ['오늘 시키면 언제 도착해요', /1~2일|1-2일|하루|이틀/],
  ])('%s', async (question, expected) => {
    const { text, fallback } = await ask(question);
    expect(text).not.toBe(fallback);
    expect(text).toMatch(expected);
    expect(verifyFigures(text, KNOWLEDGE).ok).toBe(true);
  });
});

describe('declines uncovered questions even when retrieval scores them high', () => {
  it.each(['해외 배송도 되나요?', '선물 포장 해주시나요?', '품절된 상품 재입고 언제 돼요?', '오늘 서울 날씨 어때?'])(
    '%s',
    async (question) => {
      const { text, fallback } = await ask(question);
      expect(text).toBe(fallback);
    },
  );
});
