import { describe, expect, it } from 'vitest';
import { chunkItem } from './chunk';

describe('chunkItem', () => {
  it('keeps one FAQ as one chunk with question and answer', () => {
    expect(chunkItem('faq', ' 환불 기간 ', ' 7일 이내 ')).toEqual(['질문: 환불 기간\n답변: 7일 이내']);
  });

  it('packs short paragraphs together under the title', () => {
    expect(chunkItem('text', '배송 안내', '첫 문단\n\n둘째 문단')).toEqual(['배송 안내\n첫 문단\n\n둘째 문단']);
  });

  it('starts a new chunk when the limit would be exceeded', () => {
    const chunks = chunkItem('text', 't', `${'가'.repeat(600)}\n\n${'나'.repeat(600)}`);
    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toBe(`t\n${'나'.repeat(600)}`);
  });

  it('splits a single paragraph longer than the limit', () => {
    const chunks = chunkItem('text', 't', '가'.repeat(2500));
    expect(chunks.map((chunk) => chunk.length - 2)).toEqual([1000, 1000, 500]);
  });

  it('returns nothing for blank text', () => {
    expect(chunkItem('text', 't', '\n\n  \n')).toEqual([]);
  });
});
