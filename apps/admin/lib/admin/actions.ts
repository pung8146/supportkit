'use server';

import { randomUUID } from 'node:crypto';
import type { BootstrapResponse, WidgetConfig } from '@supportkit/widget/protocol';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { syncPendingKnowledge } from '../knowledge/sync';
import { createUserClient } from '../supabase/server';
import { signToken, tokenSecret } from '../widget/token';
import { cloneDemoBot } from './demo';
import { requireOwnedBot } from './session';
import { validateKnowledge, validateSettings, type KnowledgeInput } from './validate';

// Server actions are public endpoints: each one re-checks ownership through requireOwnedBot.

export type ActionResult = { error: string } | { ok: true };

export async function startDemo(): Promise<ActionResult> {
  const supabase = await createUserClient();
  const { data: claims } = await supabase.auth.getClaims();
  let userId = claims?.claims?.sub;
  if (!userId) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      console.error(error);
      return { error: '체험을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
    }
    userId = data.user.id;
  }

  let botId: string;
  try {
    botId = await cloneDemoBot(userId);
  } catch (error) {
    console.error(error);
    return { error: '샘플 위젯을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
  redirect(`/bots/${botId}/knowledge`);
}

/** A short-lived widget session for the owner's preview; it skips the origin allowlist. */
export async function createPreviewSession(botId: string): Promise<BootstrapResponse> {
  const { bot } = await requireOwnedBot(botId);
  const origin = (await headers()).get('origin');
  if (!origin) throw new Error('missing origin');
  return {
    token: signToken({ botId: bot.id, origin, sid: randomUUID(), preview: true }, tokenSecret()),
    origin,
    config: bot.config,
    preview: true,
  };
}

export async function saveKnowledge(botId: string, itemId: string | null, input: KnowledgeInput): Promise<ActionResult> {
  const { supabase, bot } = await requireOwnedBot(botId);
  const error = validateKnowledge(input);
  if (error) return { error };

  const values = { kind: input.kind, title: input.title.trim(), body: input.body.trim() };
  const result = itemId
    ? await supabase.from('knowledge_items').update(values).eq('id', itemId).eq('bot_id', bot.id)
    : await supabase.from('knowledge_items').insert({ ...values, bot_id: bot.id });
  if (result.error) {
    console.error(result.error);
    return { error: '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  // Embed now so the very next question in the preview uses the edit.
  await syncPendingKnowledge(bot.id).catch((cause: unknown) => console.error(cause));
  revalidatePath(`/bots/${bot.id}/knowledge`);
  return { ok: true };
}

export async function deleteKnowledge(botId: string, itemId: string): Promise<ActionResult> {
  const { supabase, bot } = await requireOwnedBot(botId);
  const { error } = await supabase.from('knowledge_items').delete().eq('id', itemId).eq('bot_id', bot.id);
  if (error) {
    console.error(error);
    return { error: '삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
  revalidatePath(`/bots/${bot.id}/knowledge`);
  return { ok: true };
}

export async function retryKnowledgeSync(botId: string): Promise<ActionResult> {
  const { bot } = await requireOwnedBot(botId);
  try {
    await syncPendingKnowledge(bot.id);
  } catch (error) {
    console.error(error);
    return { error: '아직 반영하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
  revalidatePath(`/bots/${bot.id}/knowledge`);
  return { ok: true };
}

export async function saveSettings(botId: string, config: WidgetConfig): Promise<ActionResult> {
  const { supabase, bot } = await requireOwnedBot(botId);
  const starters = config.starters.map((starter) => starter.trim()).filter(Boolean);
  const clean: WidgetConfig = {
    botName: config.botName.trim(),
    launcherLabel: config.launcherLabel.trim(),
    welcome: config.welcome.trim(),
    starters,
    theme: { accent: config.theme.accent.toLowerCase(), position: config.theme.position },
  };
  const error = validateSettings(clean);
  if (error) return { error };

  const { error: updateError } = await supabase
    .from('bots')
    .update({
      name: clean.botName,
      launcher_label: clean.launcherLabel,
      welcome: clean.welcome,
      starters: clean.starters,
      theme: clean.theme,
    })
    .eq('id', bot.id);
  if (updateError) {
    console.error(updateError);
    return { error: '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
  revalidatePath(`/bots/${bot.id}`, 'layout');
  return { ok: true };
}
