import { describe, expect, it } from 'vitest';
import { historyForModel } from './conversations';

const message = (role: 'user' | 'assistant', text: string) => ({ role, text, sources: [], outcome: null });

describe('historyForModel', () => {
  it('keeps turns in order', () => {
    expect(historyForModel([message('user', '환불?'), message('assistant', '7일')])).toEqual([
      { role: 'user', content: '환불?' },
      { role: 'assistant', content: '7일' },
    ]);
  });

  it('drops empty answers left by failures', () => {
    expect(historyForModel([message('user', 'a'), message('assistant', ''), message('user', 'b')])).toEqual([
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
    ]);
  });

  it('starts with the visitor when the window cut off a question', () => {
    expect(historyForModel([message('assistant', '7일'), message('user', '배송비는?')])).toEqual([
      { role: 'user', content: '배송비는?' },
    ]);
  });
});
