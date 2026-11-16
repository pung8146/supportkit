import { createHash } from 'node:crypto';
import { serviceClient } from './db';
import { tokenSecret } from './widget/token';

const fromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** Defaults sized for a public portfolio demo; raise them per deployment through the environment. */
export const LIMITS = {
  chatPerIpHourly: fromEnv('LIMIT_CHAT_PER_IP_HOURLY', 30),
  /** One bot's share; it cannot use up the budget of other bots. */
  answersPerBotDaily: fromEnv('LIMIT_ANSWERS_PER_BOT_DAILY', 200),
  /** Cost backstop across all bots; keep it well above any single bot's share. */
  answersPerDay: fromEnv('LIMIT_ANSWERS_PER_DAY', 1000),
  inquiriesPerIpHourly: fromEnv('LIMIT_INQUIRIES_PER_IP_HOURLY', 5),
  inquiriesPerBotDaily: fromEnv('LIMIT_INQUIRIES_PER_BOT_DAILY', 50),
  demosPerIpDaily: fromEnv('LIMIT_DEMOS_PER_IP_DAILY', 5),
  demosPerDay: fromEnv('LIMIT_DEMOS_PER_DAY', 50),
};

const HOUR = 3600;
const DAY = 86_400;

/**
 * The address the platform saw. The left-most X-Forwarded-For entry is whatever the caller sent, so it
 * is never used: Vercel's own header first, then x-real-ip, then the entry the last proxy appended.
 */
// shortcut: assumes one trusted proxy (Vercel). Self-hosted without a proxy, callers can still rotate these
// headers and skip per-IP limits; the per-bot caps do not depend on the IP, so spend stays bounded.
export function clientIp(headers: Headers): string {
  return (
    headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ||
    'unknown'
  );
}

/** Raw IPs are never stored: the key is a hash salted with the day, so it cannot be joined across days. */
function ipKey(ip: string, day: string) {
  return createHash('sha256').update(`${ip}|${day}|${tokenSecret()}`).digest('hex').slice(0, 32);
}

async function consume(key: string, limit: number, ttlSeconds: number): Promise<boolean> {
  const { data, error } = await serviceClient().rpc('consume_quota', { p_key: key, p_limit: limit, p_ttl_seconds: ttlSeconds });
  if (error) throw new Error(`quota check failed: ${error.message}`);
  return data === true;
}

const windows = (now = new Date()) => {
  const iso = now.toISOString();
  return { hour: iso.slice(0, 13), day: iso.slice(0, 10), month: iso.slice(0, 7) };
};

// shortcut: checks run one after another, so a request refused by a later check still counted in the
// earlier ones; that only makes limits slightly stricter. Use one RPC if exact counts ever matter.

/** Null when the visitor may ask, otherwise the message the widget shows instead of an answer. */
export async function checkChatQuota(bot: { id: string; monthlyLimit: number }, headers: Headers): Promise<string | null> {
  const { hour, day, month } = windows();
  if (!(await consume(`chat-ip:${ipKey(clientIp(headers), day)}:${hour}`, LIMITS.chatPerIpHourly, 2 * HOUR))) {
    return '짧은 시간에 질문이 많았어요. 잠시 후 다시 시도해 주세요.';
  }
  if (!(await consume(`bot-month:${bot.id}:${month}`, bot.monthlyLimit, 40 * DAY))) {
    return '이번 달 상담 가능 횟수를 모두 사용했어요. 문의를 남겨 주시면 담당자가 확인해 드릴게요.';
  }
  const outOfToday = '오늘 준비된 상담량이 모두 소진되었어요. 내일 다시 이용하시거나 문의를 남겨 주세요.';
  if (!(await consume(`answers-bot-day:${bot.id}:${day}`, LIMITS.answersPerBotDaily, 2 * DAY))) return outOfToday;
  if (!(await consume(`answers-day:${day}`, LIMITS.answersPerDay, 2 * DAY))) return outOfToday;
  return null;
}

export async function checkInquiryQuota(botId: string, headers: Headers): Promise<boolean> {
  const { hour, day } = windows();
  return (
    (await consume(`inquiry-ip:${ipKey(clientIp(headers), day)}:${hour}`, LIMITS.inquiriesPerIpHourly, 2 * HOUR)) &&
    (await consume(`inquiry-bot-day:${botId}:${day}`, LIMITS.inquiriesPerBotDaily, 2 * DAY))
  );
}

export async function checkDemoQuota(headers: Headers): Promise<boolean> {
  const { day } = windows();
  return (
    (await consume(`demo-ip:${ipKey(clientIp(headers), day)}:${day}`, LIMITS.demosPerIpDaily, 2 * DAY)) &&
    (await consume(`demo-day:${day}`, LIMITS.demosPerDay, 2 * DAY))
  );
}
