import { randomUUID } from 'node:crypto';
import type { BootstrapResponse } from '@supportkit/widget/protocol';
import { findBotByPublicKey } from '../../../../../lib/widget/bots';
import { originAllowed } from '../../../../../lib/widget/origin';
import { signToken, tokenSecret } from '../../../../../lib/widget/token';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await context.params;
  const origin = request.headers.get('origin');
  const bot = await findBotByPublicKey(publicKey).catch((error: unknown) => {
    console.error(error);
    return undefined;
  });
  if (bot === undefined) return Response.json({ error: 'service_unavailable' }, { status: 503 });

  // Unknown key and disallowed origin look identical to the caller.
  if (!bot || !origin || !originAllowed(origin, bot.allowedOrigins)) {
    return Response.json({ error: 'origin_not_allowed' }, { status: 403, headers: { Vary: 'Origin' } });
  }

  const body: BootstrapResponse = {
    token: signToken({ botId: bot.id, origin, sid: randomUUID() }, tokenSecret()),
    origin,
    config: bot.config,
  };

  return Response.json(body, {
    headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store' },
  });
}
