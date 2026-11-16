import { describe, expect, it } from 'vitest';
import { originLabel, sortInquiries, summarize, type InquiryRow } from './inbox';

const inquiry = (id: string, status: InquiryRow['status'], created_at: string): InquiryRow => ({
  id,
  status,
  created_at,
  question: '',
  contact: '',
  memo: null,
  expires_at: null,
  conversation_id: null,
});

describe('sortInquiries', () => {
  it('puts open inquiries first, newest first within a status', () => {
    const sorted = sortInquiries([
      inquiry('done', 'resolved', '2026-11-17T03:00:00Z'),
      inquiry('old-new', 'new', '2026-11-16T00:00:00Z'),
      inquiry('working', 'in_progress', '2026-11-17T02:00:00Z'),
      inquiry('new-new', 'new', '2026-11-17T01:00:00Z'),
    ]);
    expect(sorted.map((row) => row.id)).toEqual(['new-new', 'old-new', 'working', 'done']);
  });
});

describe('summarize', () => {
  it('takes the first question and counts unanswered replies per conversation', () => {
    const [summary] = summarize(
      [{ id: 'c1', origin: 'https://shop.test', last_at: '2026-11-17T00:00:00Z' }],
      [
        { conversation_id: 'c1', role: 'user', content: '환불?', outcome: null },
        { conversation_id: 'c1', role: 'assistant', content: '7일', outcome: 'answered' },
        { conversation_id: 'c1', role: 'user', content: '포장?', outcome: null },
        { conversation_id: 'c1', role: 'assistant', content: '못 찾음', outcome: 'no_match' },
        { conversation_id: 'c2', role: 'assistant', content: 'x', outcome: 'error' },
      ],
    );
    expect(summary).toMatchObject({ firstQuestion: '환불?', unanswered: 1 });
  });

  it('handles a conversation without messages', () => {
    expect(summarize([{ id: 'c1', origin: 'preview', last_at: '' }], [])[0]).toMatchObject({ firstQuestion: '(질문 없음)', unanswered: 0 });
  });
});

describe('originLabel', () => {
  it.each([
    ['preview', '미리보기'],
    ['https://shop.example.com', 'shop.example.com'],
    ['http://localhost:5174', 'localhost:5174'],
  ])('%s -> %s', (origin, label) => {
    expect(originLabel(origin)).toBe(label);
  });
});
