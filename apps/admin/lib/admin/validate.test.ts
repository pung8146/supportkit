import { describe, expect, it } from 'vitest';
import { normalizeOrigin, validateKnowledge, validateSettings } from './validate';
import { originAllowed } from '../widget/origin';

describe('normalizeOrigin', () => {
  it.each([
    ['shop.example.com', 'https://shop.example.com'],
    ['https://Shop.Example.com/', 'https://shop.example.com'],
    ['https://shop.example.com:8443', 'https://shop.example.com:8443'],
    ['http://localhost:5174', 'http://localhost:5174'],
    ['*.brand.co.kr', 'https://*.brand.co.kr'],
    ['https://*.brand.co.kr', 'https://*.brand.co.kr'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeOrigin(input)).toBe(expected);
  });

  it.each([
    '',
    'http://shop.example.com',
    'https://shop.example.com/path',
    'https://shop.example.com?x=1',
    'https://user:pw@shop.example.com',
    'intranet',
    'https://*.com',
    'https://a.*.example.com',
    'ftp://shop.example.com',
    'javascript:alert(1)',
  ])('rejects %j', (input) => {
    expect(normalizeOrigin(input)).toBeNull();
  });

  it('produces values the widget allowlist matches', () => {
    expect(originAllowed('https://shop.example.com', [normalizeOrigin('shop.example.com/')!])).toBe(true);
    expect(originAllowed('https://a.brand.co.kr', [normalizeOrigin('*.brand.co.kr')!])).toBe(true);
  });
});

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
