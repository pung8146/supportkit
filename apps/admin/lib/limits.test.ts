import { describe, expect, it } from 'vitest';
import { clientIp } from './limits';

describe('clientIp', () => {
  it("prefers Vercel's own header", () => {
    expect(clientIp(new Headers({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('then x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2', 'x-forwarded-for': '1.1.1.1' }))).toBe('198.51.100.2');
  });

  it('never trusts the caller-supplied left-most X-Forwarded-For entry', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('falls back to a shared bucket', () => {
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
