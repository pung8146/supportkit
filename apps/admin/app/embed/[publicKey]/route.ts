import { findBotByPublicKey } from '../../../lib/widget/bots';
import { frameAncestors } from '../../../lib/widget/origin';

export const dynamic = 'force-dynamic';

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>상담 채팅</title>
<link rel="stylesheet" href="/widget/embed.css">
<script type="module" src="/widget/embed.js"></script>
</head>
<body><div id="root"></div></body>
</html>`;

export async function GET(_request: Request, context: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await context.params;
  const bot = await findBotByPublicKey(publicKey).catch((error: unknown) => {
    console.error(error);
    return undefined;
  });
  if (bot === undefined) return new Response('Service unavailable', { status: 503 });
  if (!bot) return new Response('Not found', { status: 404 });

  const policy = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${frameAncestors(bot.allowedOrigins)}`,
  ].join('; ');

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': policy,
      'Cache-Control': 'no-store',
    },
  });
}
