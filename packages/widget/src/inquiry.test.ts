import { describe, expect, it } from 'vitest';
import { validateInquiry } from './inquiry';

const valid = { question: '선물 포장 되나요?', contact: 'me@example.com', consent: true };

describe('validateInquiry', () => {
  it('accepts a complete inquiry', () => {
    expect(validateInquiry(valid)).toEqual({});
  });

  it.each(['010-1234-5678', '01012345678', '+82 10 1234 5678', '02-123-4567', 'a.b+c@shop.co.kr'])('accepts contact %s', (contact) => {
    expect(validateInquiry({ ...valid, contact })).toEqual({});
  });

  it.each(['', '   ', '홍길동', '1234', 'me@example', 'me example.com', `${'a'.repeat(95)}@b.com`])('rejects contact %j', (contact) => {
    expect(validateInquiry({ ...valid, contact }).contact).toBeDefined();
  });

  it('requires consent', () => {
    expect(validateInquiry({ ...valid, consent: false })).toEqual({ consent: '개인정보 수집에 동의해야 접수할 수 있어요.' });
  });

  it('requires a question of at most 1,000 characters', () => {
    expect(validateInquiry({ ...valid, question: ' ' }).question).toBeDefined();
    expect(validateInquiry({ ...valid, question: '가'.repeat(1001) }).question).toBeDefined();
    expect(validateInquiry({ ...valid, question: '가'.repeat(1000) })).toEqual({});
  });
});
