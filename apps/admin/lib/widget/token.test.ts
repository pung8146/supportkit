import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './token';

const secret = 'a'.repeat(32);
const claims = { botId: 'bot_1', origin: 'https://shop.test', sid: 's1' };
const now = 1_800_000_000_000;

describe('widget token', () => {
  it('round-trips claims', () => {
    expect(verifyToken(signToken(claims, secret, now), secret, now)).toMatchObject(claims);
  });

  it('expires after 15 minutes', () => {
    const token = signToken(claims, secret, now);
    expect(verifyToken(token, secret, now + 14 * 60_000)).not.toBeNull();
    expect(verifyToken(token, secret, now + 15 * 60_000)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    expect(verifyToken(signToken(claims, 'b'.repeat(32), now), secret, now)).toBeNull();
  });

  it('rejects a modified payload', () => {
    const [, signature] = signToken(claims, secret, now).split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, botId: 'bot_2', exp: 9e9 })).toString('base64url');
    expect(verifyToken(`${forged}.${signature}`, secret, now)).toBeNull();
  });

  it.each(['', 'abc', 'a.b.c'])('rejects malformed value %j', (value) => {
    expect(verifyToken(value, secret, now)).toBeNull();
  });
});
