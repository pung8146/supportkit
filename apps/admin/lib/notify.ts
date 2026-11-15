import { serviceClient } from './db';
import type { Bot } from './widget/bots';

/**
 * The visitor's contact is deliberately left out: it stays in the database
 * instead of spreading to the mail provider and the operator's inbox.
 */
export function inquiryEmail(botName: string, question: string) {
  const name = botName.replace(/\s+/g, ' ').trim();
  return {
    subject: `[${name}] 새 문의가 접수되었습니다`,
    text: `${name} 위젯에서 답하지 못한 질문에 방문자가 문의를 남겼습니다.\n\n문의 내용\n${question}\n\n연락처와 처리 상태는 SupportKit 관리자 화면에서 확인하세요.\n`,
  };
}

async function recipientFor(bot: Bot): Promise<string | undefined> {
  if (!bot.ownerId) return process.env.INQUIRY_NOTIFY_EMAIL || undefined;
  const { data, error } = await serviceClient().auth.admin.getUserById(bot.ownerId);
  if (error) throw new Error(`owner lookup failed: ${error.message}`);
  return data.user?.email;
}

/** Emails the bot owner. Callers must not let a failure here fail the inquiry itself. */
export async function notifyInquiry(bot: Bot, inquiryId: string, question: string): Promise<'sent' | 'skipped'> {
  const key = process.env.RESEND_API_KEY;
  const to = key ? await recipientFor(bot) : undefined;
  if (!key || !to) return 'skipped';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      // A retried request for the same inquiry never sends a second email.
      'idempotency-key': `inquiry-${inquiryId}`,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'SupportKit <onboarding@resend.dev>',
      to,
      ...inquiryEmail(bot.config.botName, question),
    }),
  });
  if (!response.ok) throw new Error(`notification failed: ${response.status} ${await response.text()}`);
  return 'sent';
}
