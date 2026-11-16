import { normalizeOrigin } from '../admin/validate';
import { serviceClient } from '../db';

const THROTTLE_MS = 5 * 60 * 1000;

/**
 * Records where the widget loaded (or was refused), at most once per five minutes per bot,
 * so the install tab can say "감지됨" without a database write on every page view.
 * The Origin header is attacker-controlled: only values that are already in the exact form an
 * operator could have typed (lowercase host of [a-z0-9.-]) are stored, and never put in a filter.
 */
export async function recordInstallSeen(botId: string, origin: string, allowed: boolean) {
  // No '*': a forged wildcard must never reach the one-click allow button.
  if (origin.includes('*') || normalizeOrigin(origin) !== origin) return;
  const [originColumn, atColumn] = allowed ? ['last_seen_origin', 'last_seen_at'] : ['last_blocked_origin', 'last_blocked_at'];
  const staleBefore = new Date(Date.now() - THROTTLE_MS).toISOString();
  const { error } = await serviceClient()
    .from('bots')
    .update({ [originColumn]: origin, [atColumn]: new Date().toISOString() })
    .eq('id', botId)
    .or(`${atColumn}.is.null,${atColumn}.lt.${staleBefore}`);
  if (error) throw new Error(`install record failed: ${error.message}`);
}
