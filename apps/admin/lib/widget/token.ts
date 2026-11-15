import { createHmac, timingSafeEqual } from 'node:crypto';

/** preview: issued to the bot owner for the admin preview, exempt from the origin allowlist. */
export type WidgetToken = { botId: string; origin: string; sid: string; exp: number; preview?: true };

const TTL_SECONDS = 15 * 60;

const mac = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest();

export function tokenSecret(): string {
  const secret = process.env.WIDGET_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new Error('WIDGET_TOKEN_SECRET must be at least 32 characters');
  return secret;
}

export function signToken(claims: Omit<WidgetToken, 'exp'>, secret: string, now = Date.now()): string {
  const token: WidgetToken = { ...claims, exp: Math.floor(now / 1000) + TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(token)).toString('base64url');
  return `${payload}.${mac(payload, secret).toString('base64url')}`;
}

export function verifyToken(value: string, secret: string, now = Date.now()): WidgetToken | null {
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra !== undefined) return null;

  const expected = mac(payload, secret);
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  const token = JSON.parse(Buffer.from(payload, 'base64url').toString()) as WidgetToken;
  return token.exp * 1000 > now ? token : null;
}
