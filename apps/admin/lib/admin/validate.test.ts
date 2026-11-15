import { describe, expect, it } from 'vitest';
import { validateKnowledge, validateSettings } from './validate';

const config = {
  botName: '소담공방 안내',
  launcherLabel: '문의하기',
  welcome: '안녕하세요.',
  starters: ['환불은 며칠 안에 되나요?'],
  theme: { accent: '#1f4d3f', position: 'right' as const },
};

describe('validateKnowledge', () => {
  it('accepts a FAQ and a text item', () => {
    expect(validateKnowledge({ kind: 'faq', title: '환불?', body: '7일' })).toBeNull();
    expect(validateKnowledge({ kind: 'text', title: '배송 안내', body: '내용' })).toBeNull();
  });

  it('names the missing field in the words of each kind', () => {
    expect(validateKnowledge({ kind: 'faq', title: ' ', body: 'x' })).toBe('질문을 입력해 주세요.');
    expect(validateKnowledge({ kind: 'text', title: 'x', body: '' })).toBe('내용을 입력해 주세요.');
  });

  it('limits length', () => {
    expect(validateKnowledge({ kind: 'faq', title: 'q', body: '가'.repeat(4001) })).not.toBeNull();
  });
});

describe('validateSettings', () => {
  it('accepts valid settings', () => {
    expect(validateSettings(config)).toBeNull();
  });

  it.each([
    [{ ...config, botName: '' }, '위젯 이름'],
    [{ ...config, launcherLabel: '가'.repeat(21) }, '버튼 문구'],
    [{ ...config, starters: ['a', 'b', 'c', 'd'] }, '3개'],
    [{ ...config, starters: [' '] }, '시작 질문'],
    [{ ...config, theme: { accent: 'red', position: 'right' as const } }, '색상'],
    [{ ...config, theme: { accent: '#000000', position: 'top' as never } }, '위치'],
  ])('rejects %#', (input, message) => {
    expect(validateSettings(input)).toContain(message);
  });
});
