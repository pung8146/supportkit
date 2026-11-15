// Billed (embeddings only, well under a cent). Measures how close real visitor questions land
// to the demo knowledge, which is what MIN_SIMILARITY is calibrated from.
import { beforeAll, describe, expect, it } from 'vitest';
import { MIN_SIMILARITY, search } from '../../apps/admin/lib/answer/retrieve';
import { syncPendingKnowledge } from '../../apps/admin/lib/knowledge/sync';

process.loadEnvFile('apps/admin/.env.local');

const BOT = '00000000-0000-4000-8000-000000000001';

// Phrased the way visitors write, not copied from the FAQ titles.
const covered: [string, string][] = [
  ['주문하면 며칠 만에 와요?', '배송은 얼마나 걸리나요?'],
  ['오늘 시키면 언제 도착해요', '배송은 얼마나 걸리나요?'],
  ['토요일에도 발송하나요?', '배송은 얼마나 걸리나요?'],
  ['택배비 있어요?', '배송비는 얼마인가요?'],
  ['무료배송 기준이 뭐예요', '배송비는 얼마인가요?'],
  ['제주도는 배송비 더 내야 하나요?', '배송비는 얼마인가요?'],
  ['반품하고 싶어요', '환불은 어떻게 하나요?'],
  ['마음이 바뀌었는데 돈 돌려받을 수 있나요', '환불은 어떻게 하나요?'],
  ['환불 기간이 어떻게 돼요?', '환불은 어떻게 하나요?'],
  ['컵에 금이 가서 왔어요', '파손된 상품을 받았어요.'],
  ['깨진 그릇 교환되나요', '파손된 상품을 받았어요.'],
  ['배송 중에 깨졌어요 어떡하죠', '파손된 상품을 받았어요.'],
  ['화병은 주문 제작인가요?', '주문 제작 상품은 언제 받을 수 있나요?'],
  ['옹기 화병 받으려면 얼마나 기다려야 해요', '주문 제작 상품은 언제 받을 수 있나요?'],
  ['주문 제작 상품도 환불돼요?', '주문 제작 상품은 언제 받을 수 있나요?'],
  ['고객센터 몇 시에 열어요?', '고객센터 운영 시간이 어떻게 되나요?'],
  ['점심시간에도 문의 답변 받을 수 있나요', '고객센터 운영 시간이 어떻게 되나요?'],
  ['상담 가능 시간 알려주세요', '고객센터 운영 시간이 어떻게 되나요?'],
];

// Plausible shop questions the knowledge does not answer, plus off-topic ones.
const uncovered = [
  '해외 배송도 되나요?',
  '적립금은 언제 소멸되나요?',
  '카드 무이자 할부 되나요?',
  '오프라인 매장 주소가 어디예요?',
  '선물 포장 해주시나요?',
  '품절된 상품 재입고 언제 돼요?',
  '회사 단체 주문 할인 있나요?',
  '현금영수증 발급되나요?',
  '식기세척기 사용해도 되나요?',
  '회원가입하면 쿠폰 주나요?',
  '오늘 서울 날씨 어때?',
  '파이썬으로 정렬하는 법 알려줘',
];

type Row = { question: string; top: string; similarity: number };
const coveredRows: (Row & { expected: string; rank: number })[] = [];
const uncoveredRows: Row[] = [];

beforeAll(async () => {
  await syncPendingKnowledge(BOT);

  for (const [question, expected] of covered) {
    const results = await search(BOT, question, 6);
    const rank = results.findIndex((result) => result.title === expected) + 1;
    coveredRows.push({ question, expected, rank, top: results[0]!.title, similarity: results.find((r) => r.title === expected)?.similarity ?? 0 });
  }
  for (const question of uncovered) {
    const [top] = await search(BOT, question, 1);
    uncoveredRows.push({ question, top: top!.title, similarity: top!.similarity });
  }

  const fmt = (n: number) => n.toFixed(3);
  console.info('\n지식 안 질문 (정답 항목의 유사도, 순위)');
  for (const row of [...coveredRows].sort((a, b) => a.similarity - b.similarity)) {
    console.info(`  ${fmt(row.similarity)}  rank ${row.rank}  ${row.question}${row.rank === 1 ? '' : `  (1위: ${row.top})`}`);
  }
  console.info('\n지식 밖 질문 (1위 항목의 유사도)');
  for (const row of [...uncoveredRows].sort((a, b) => b.similarity - a.similarity)) {
    console.info(`  ${fmt(row.similarity)}  ${row.question}  (1위: ${row.top})`);
  }
  const lowestCovered = Math.min(...coveredRows.map((row) => row.similarity));
  const highestUncovered = Math.max(...uncoveredRows.map((row) => row.similarity));
  console.info(`\n지식 안 최저 ${fmt(lowestCovered)} / 지식 밖 최고 ${fmt(highestUncovered)} / 현재 기준 ${MIN_SIMILARITY}\n`);
}, 120_000);

describe('retrieval', () => {
  it('ranks the right FAQ within the top 3 for every covered question', () => {
    expect(coveredRows.filter((row) => row.rank < 1 || row.rank > 3)).toEqual([]);
  });

  it('never gates out a covered question, with a margin', () => {
    expect(coveredRows.filter((row) => row.similarity < MIN_SIMILARITY + 0.05)).toEqual([]);
  });
});
