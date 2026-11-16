import { serviceClient } from '../db';

const THROTTLE_MS = 5 * 60 * 1000;

/**
 * Records where the widget loaded (or was refused), at most once per five minutes per bot,
 * so the install tab can say "감지됨" without a database write on every page view.
 */
export async function recordInstallSeen(botId: string, origin: string, allowed: boolean) {
  const [originColumn, atColumn] = allowed ? ['last_seen_origin', 'last_seen_at'] : ['last_blocked_origin', 'last_blocked_at'];
  const staleBefore = new Date(Date.now() - THROTTLE_MS).toISOString();
  const { error } = await serviceClient()
    .from('bots')
    .update({ [originColumn]: origin, [atColumn]: new Date().toISOString() })
    .eq('id', botId)
    // Values are quoted: an origin contains ':' and '/' (callers pass only parsed origins, no quotes).
    .or(`${atColumn}.is.null,${atColumn}.lt."${staleBefore}",${originColumn}.neq."${origin}"`);
  if (error) throw new Error(`install record failed: ${error.message}`);
}
