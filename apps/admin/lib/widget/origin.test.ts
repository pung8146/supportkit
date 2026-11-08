import { describe, expect, it } from 'vitest';
import { frameAncestors, originAllowed } from './origin';

const allowed = ['https://shop.example.com', 'https://*.brand.co.kr', 'http://localhost:5174'];

describe('originAllowed', () => {
  it.each([
    'https://shop.example.com',
    'https://a.brand.co.kr',
    'https://a.b.brand.co.kr',
    'http://localhost:5174',
  ])('allows %s', (origin) => {
    expect(originAllowed(origin, allowed)).toBe(true);
  });

  it.each([
    null,
    '',
    'null',
    'http://shop.example.com',
    'https://shop.example.com.evil.test',
    'https://evil-shop.example.com',
    'https://brand.co.kr',
    'https://evilbrand.co.kr',
    'https://a.brand.co.kr.evil.test',
    'http://a.brand.co.kr',
    'http://localhost:5175',
    'https://shop.example.com/path',
  ])('rejects %s', (origin) => {
    expect(originAllowed(origin, allowed)).toBe(false);
  });

  it('rejects everything for an empty list', () => {
    expect(originAllowed('https://shop.example.com', [])).toBe(false);
  });
});

describe('frameAncestors', () => {
  it('joins origins', () => {
    expect(frameAncestors(['https://a.test', 'https://b.test'])).toBe('https://a.test https://b.test');
  });

  it('denies all framing for an empty list', () => {
    expect(frameAncestors([])).toBe("'none'");
  });
});
