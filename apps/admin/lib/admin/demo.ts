import { serviceClient } from '../db';
import { syncPendingKnowledge } from '../knowledge/sync';

const TEMPLATE_PUBLIC_KEY = 'pk_demo_shop';
const DEMO_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * Gives a demo visitor their own copy of the sample shop bot.
 * Uses service_role because is_demo and expires_at are server-only columns.
 * The copy has no allowed origins, so it only runs inside the admin preview.
 */
export async function cloneDemoBot(userId: string): Promise<string> {
  const db = serviceClient();
  const { data: template, error } = await db
    .from('bots')
    .select('id, name, launcher_label, welcome, starters, theme, fallback')
    .eq('public_key', TEMPLATE_PUBLIC_KEY)
    .single();
  if (error) throw new Error(`demo template missing: ${error.message}`);

  const { id: templateId, ...settings } = template;
  const { data: bot, error: botError } = await db
    .from('bots')
    .insert({
      ...settings,
      owner_id: userId,
      is_demo: true,
      expires_at: new Date(Date.now() + DEMO_LIFETIME_MS).toISOString(),
      allowed_origins: [],
      monthly_limit: 100,
    })
    .select('id')
    .single();
  if (botError) throw new Error(`demo bot create failed: ${botError.message}`);

  const { data: items, error: itemsError } = await db.from('knowledge_items').select('kind, title, body').eq('bot_id', templateId);
  if (itemsError) throw new Error(`demo knowledge read failed: ${itemsError.message}`);
  const { error: copyError } = await db.from('knowledge_items').insert((items ?? []).map((item) => ({ ...item, bot_id: bot.id })));
  if (copyError) throw new Error(`demo knowledge copy failed: ${copyError.message}`);

  // Ready before the first question; if this fails, the first question retries it.
  await syncPendingKnowledge(bot.id).catch((cause: unknown) => console.error(cause));
  return bot.id;
}
