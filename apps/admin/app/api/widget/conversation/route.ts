import { findConversation, loadHistory } from '../../../../lib/conversations';
import { authorizeWidget } from '../../../../lib/widget/auth';

export const dynamic = 'force-dynamic';

const RESTORE_LIMIT = 50;

/** Returns a visitor's recent conversation so the widget can pick up where they left off. */
export async function POST(request: Request) {
  const auth = await authorizeWidget(request);
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => null)) as { conversation?: unknown } | null;
  if (typeof body?.conversation !== 'string') return Response.json({ error: 'invalid_request' }, { status: 400 });

  try {
    const conversation = await findConversation(auth.bot, body.conversation, { restoreWindow: true });
    if (!conversation) return Response.json({ error: 'not_found' }, { status: 404 });
    const messages = await loadHistory(conversation.id, RESTORE_LIMIT);
    return Response.json({ messages }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
