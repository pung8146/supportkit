import { describe, expect, it } from 'vitest';
import { verifyFigures } from './verify-figures';

const check = (answer: string, source: string) => verifyFigures(answer, [source]).ok;

describe('verifyFigures', () => {
  it.each([
    ['7일 이내에 환불됩니다.', '수령 후 7일 이내 환불 가능'],
    ['배송비는 3만원입니다.', '배송비 30,000원'],
    ['3만 5천원입니다.', '가격 35,000원'],
    ['30,000원입니다.', '가격 3만원'],
    ['일주일 안에 신청하세요.', '7일 이내 신청'],
    ['2주 안에 도착합니다.', '14일 이내 도착'],
    ['1~2일 걸립니다.', '보통 1일에서 2일 소요'],
    ['이틀 걸립니다.', '2일 소요'],
    ['한 달 이내입니다.', '1개월 이내'],
    ['10퍼센트 할인됩니다.', '10% 할인'],
    ['오후 2시 전 주문은 당일 출고됩니다.', '오후 2시 이전 주문 당일 출고'],
    ['무료로 배송됩니다.', '5만원 이상 무료배송'],
    ['환불해 드립니다.', '환불 정책 안내'],
    ['환불이 가능합니다 [s1].', '환불 가능'],
    ['1. 고객센터에 연락합니다.\n2. 접수합니다.', '고객센터 연락 후 접수'],
  ])('accepts %s', (answer, source) => {
    expect(check(answer, source)).toBe(true);
  });

  it.each([
    ['14일 이내에 환불됩니다.', '수령 후 7일 이내 환불 가능'],
    ['배송비는 3만원입니다.', '배송비 3,000원'],
    ['무료로 배송됩니다.', '배송비 3,000원'],
    ['3영업일 소요됩니다.', '3일 소요'],
    ['3일 소요됩니다.', '3영업일 소요'],
    ['7시간 걸립니다.', '7일 걸립니다'],
    ['1~3일 걸립니다.', '1~2일 걸립니다'],
    ['이틀 걸립니다.', '3일 소요'],
    ['고객센터는 1588-0000입니다.', '고객센터 운영'],
    ['20% 할인됩니다.', '10% 할인'],
  ])('rejects %s', (answer, source) => {
    expect(check(answer, source)).toBe(false);
  });

  it('checks against all sources together', () => {
    expect(verifyFigures('7일 이내, 3,000원입니다.', ['7일 이내', '배송비 3,000원']).ok).toBe(true);
  });

  it('reports what it could not support', () => {
    expect(verifyFigures('14일과 3,000원입니다.', ['배송비 3,000원']).unsupported).toEqual(['14일']);
  });
});
