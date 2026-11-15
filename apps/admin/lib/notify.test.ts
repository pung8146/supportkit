import { afterEach, describe, expect, it, vi } from 'vitest';
import { inquiryEmail, notifyInquiry } from './notify';
import type { Bot } from './widget/bots';

const bot: Bot = {
  id: 'b1',
  ownerId: null,
  publicKey: 'pk',
  allowedOrigins: [],
  fallback: '',
  retentionDays: 90,
  config: { botName: '소담공방 안내', launcherLabel: '', welcome: '', starters: [], theme: { accent: '#000', position: 'right' } },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('inquiryEmail', () => {
  it('names the bot and quotes the question', () => {
    const email = inquiryEmail('소담공방 안내', '선물 포장 되나요?');
    expect(email.subject).toBe('[소담공방 안내] 새 문의가 접수되었습니다');
    expect(email.text).toContain('선물 포장 되나요?');
  });

  it('keeps an operator-set name on one line in the subject', () => {
    expect(inquiryEmail('가게\r\nBcc: x@y.z', 'q').subject).toBe('[가게 Bcc: x@y.z] 새 문의가 접수되었습니다');
  });
});

describe('notifyInquiry', () => {
  it('skips without an API key or a recipient', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('INQUIRY_NOTIFY_EMAIL', 'ops@example.com');
    expect(await notifyInquiry(bot, 'i1', 'q')).toBe('skipped');

    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('INQUIRY_NOTIFY_EMAIL', '');
    expect(await notifyInquiry(bot, 'i1', 'q')).toBe('skipped');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends once per inquiry to the configured address for the demo bot', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{"id":"e1"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('INQUIRY_NOTIFY_EMAIL', 'ops@example.com');

    expect(await notifyInquiry(bot, 'i1', '선물 포장 되나요?')).toBe('sent');
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers['idempotency-key']).toBe('inquiry-i1');
    expect(JSON.parse(init.body)).toMatchObject({ to: 'ops@example.com', subject: '[소담공방 안내] 새 문의가 접수되었습니다' });
  });

  it('throws on a provider error so the caller can log it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 422 })));
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('INQUIRY_NOTIFY_EMAIL', 'ops@example.com');
    await expect(notifyInquiry(bot, 'i1', 'q')).rejects.toThrow('422');
  });
});
