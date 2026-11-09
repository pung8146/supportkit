import { describe, expect, it } from 'vitest';
import { maskPII } from './mask-pii';

describe('maskPII', () => {
  it.each([
    ['제 번호는 010-1234-5678이에요', '제 번호는 [전화번호]이에요'],
    ['01012345678로 연락주세요', '[전화번호]로 연락주세요'],
    ['+82 10-1234-5678', '[전화번호]'],
    ['매장 02-123-4567', '매장 [전화번호]'],
    ['test.user+a@example.co.kr 입니다', '[이메일] 입니다'],
    ['주민번호 900101-1234567', '주민번호 [주민등록번호]'],
    ['9001011234567', '[주민등록번호]'],
    ['카드 1234-5678-9012-3456', '카드 [카드번호]'],
    ['1234 5678 9012 3456', '[카드번호]'],
  ])('masks %s', (input, expected) => {
    expect(maskPII(input)).toBe(expected);
  });

  it.each([
    '환불은 7일 이내입니다',
    '주문번호 20261108-1234567',
    '배송비 3,000원',
    '1588-1234',
    '상품코드 A-100200',
  ])('keeps %s', (input) => {
    expect(maskPII(input)).toBe(input);
  });

  it('masks several values in one message', () => {
    expect(maskPII('a@b.co 010-1111-2222')).toBe('[이메일] [전화번호]');
  });
});
