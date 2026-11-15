import { randomUUID } from 'node:crypto';
import type { ChatEvent, ChatSource } from '@supportkit/widget/protocol';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const answers: { match: RegExp; text: string; sources: ChatSource[] }[] = [
  {
    match: /환불|반품/,
    text: '상품을 받은 날부터 7일 이내에 환불을 신청하실 수 있어요. 사용하지 않은 상품만 가능합니다.',
    sources: [{ title: '교환·환불 안내' }],
  },
  {
    match: /배송/,
    text: '평일 오후 2시 이전 주문은 당일 출고되며, 보통 1~2일 안에 도착합니다.',
    sources: [{ title: '배송 안내' }],
  },
];

const notFound = '등록된 안내에서 답을 찾지 못했어요. 문의를 남겨 주시면 담당자가 확인해 드릴게요.';

/**
 * Deterministic answers for E2E (LLM_MODE=fake): no cost, no network.
 * `__slow__` slows the stream, `__fail__` fails it mid-way, `__replace__` exercises answer replacement.
 */
export async function* fakeEvents(question: string): AsyncGenerator<ChatEvent> {
  yield { type: 'meta', messageId: randomUUID() };
  const found = answers.find((candidate) => candidate.match.test(question));
  const delay = question.includes('__slow__') ? 200 : 25;
  const pieces = (found?.text ?? notFound).match(/.{1,4}/gs) ?? [];

  for (const [index, piece] of pieces.entries()) {
    if (question.includes('__fail__') && index === 3) throw new Error('fake provider failure');
    await wait(delay);
    yield { type: 'delta', text: piece };
  }

  if (question.includes('__replace__')) {
    yield { type: 'replace', text: notFound };
    return;
  }
  if (found) yield { type: 'sources', sources: found.sources };
}
