import { randomUUID } from 'node:crypto';
import type { BootstrapResponse } from '@supportkit/widget/protocol';
import { findBotByPublicKey } from '../../../../../lib/widget/bots';
import { recordInstallSeen } from '../../../../../lib/widget/install-seen';
import { originAllowed } from '../../../../../lib/widget/origin';
import { signToken, tokenSecret } from '../../../../../lib/widget/token';

export const dynamic = 'force-dynamic';

function isOrigin(value: string) {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

export async function POST(request: Request, context: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await context.params;
  const origin = request.headers.get('origin');
  const bot = await findBotByPublicKey(publicKey).catch((error: unknown) => {
    console.error(error);
    return undefined;
  });
  if (bot === undefined) return Response.json({ error: 'service_unavailable' }, { status: 503 });

  const allowed = Boolean(bot && origin && originAllowed(origin, bot.allowedOrigins));
  // Only well-formed origins are recorded; the value is shown to the operator in the install tab.
  if (bot && origin && isOrigin(origin)) {
    await recordInstallSeen(bot.id, origin, allowed).catch((error: unknown) => console.error(error));
  }

  // Unknown key and disallowed origin look identical to the caller.
  if (!bot || !origin || !allowed) {
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
