import { describe, expect, it } from 'vitest';
import { createCitationFilter } from './citations';

function run(chunks: string[]) {
  const filter = createCitationFilter();
  const text = chunks.map((chunk) => filter.push(chunk)).join('') + filter.flush();
  return { text, cited: filter.cited(), noAnswer: filter.noAnswer() };
}

describe('createCitationFilter', () => {
  it('removes markers and records cited numbers', () => {
    expect(run(['7일 이내입니다.[1] 배송은 1~2일입니다.[2, 3]'])).toEqual({
      text: '7일 이내입니다. 배송은 1~2일입니다.',
      cited: [1, 2, 3],
      noAnswer: false,
    });
  });

  it('handles a marker split across chunks', () => {
    expect(run(['가능합니다.', '[', '1', ']', ' 감사합니다.'])).toMatchObject({
      text: '가능합니다. 감사합니다.',
      cited: [1],
    });
  });

  it('detects the no-answer marker', () => {
    expect(run(['[없', '음]'])).toEqual({ text: '', cited: [], noAnswer: true });
  });

  it('keeps brackets that are not markers', () => {
    expect(run(['[공지] 안내입니다', ' [a] 끝'])).toMatchObject({ text: '[공지] 안내입니다 [a] 끝', cited: [] });
  });

  it('releases an unclosed bracket at the end', () => {
    expect(run(['가격은 [1'])).toMatchObject({ text: '가격은 [1', cited: [] });
  });

  it('does not hold back a long unclosed bracket', () => {
    const filter = createCitationFilter();
    expect(filter.push('[이건 아주 긴 괄호 문장')).toBe('[이건 아주 긴 괄호 문장');
  });
});
