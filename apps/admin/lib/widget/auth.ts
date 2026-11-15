import { findBotById, type Bot } from './bots';
import { originAllowed } from './origin';
import { tokenSecret, verifyToken, type WidgetToken } from './token';

/** Shared check for every widget API call: a valid token whose origin the bot still allows. */
export async function authorizeWidget(request: Request): Promise<{ token: WidgetToken; bot: Bot } | Response> {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '');
  const token = bearer ? verifyToken(bearer, tokenSecret()) : null;
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const bot = await findBotById(token.botId).catch((error: unknown) => {
    console.error(error);
    return undefined;
  });
  if (bot === undefined) return Response.json({ error: 'service_unavailable' }, { status: 503 });

  // Rechecked per request so removing a domain takes effect before the token expires.
  if (!bot || !originAllowed(token.origin, bot.allowedOrigins)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return { token, bot };
}
