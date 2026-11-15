import { INQUIRY_CONSENT_VERSION, validateInquiry } from '@supportkit/widget/inquiry';
import { maskPII } from '../../../../lib/answer/mask-pii';
import { findConversation } from '../../../../lib/conversations';
import { serviceClient } from '../../../../lib/db';
import { notifyInquiry } from '../../../../lib/notify';
import { authorizeWidget } from '../../../../lib/widget/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeWidget(request);
  if (auth instanceof Response) return auth;
  const { bot } = auth;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { question, contact, consent, conversation } = body ?? {};
  if (typeof question !== 'string' || typeof contact !== 'string' || typeof consent !== 'boolean') {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }
  const errors = validateInquiry({ question, contact, consent });
  if (Object.keys(errors).length > 0) return Response.json({ error: 'invalid_inquiry', errors }, { status: 400 });

  const masked = maskPII(question.trim());
  let inquiryId: string;
  try {
    const linked = typeof conversation === 'string' ? await findConversation(bot, conversation) : null;
    const { data, error } = await serviceClient()
      .from('inquiries')
      .insert({
        bot_id: bot.id,
        conversation_id: linked?.id ?? null,
        // The contact is stored as given because it is the purpose of the form; the question is not.
        question: masked,
        contact: contact.trim(),
        consent_version: INQUIRY_CONSENT_VERSION,
        consented_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    inquiryId = data.id;
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'service_unavailable' }, { status: 503 });
  }

  // The inquiry is already saved; a mail outage only costs the alert, never the inquiry.
  await notifyInquiry(bot, inquiryId, masked).catch((error: unknown) => console.error(error));
  return Response.json({ ok: true }, { status: 201 });
}
