'use server';

import { randomUUID } from 'node:crypto';
import type { BootstrapResponse, WidgetConfig } from '@supportkit/widget/protocol';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { syncPendingKnowledge } from '../knowledge/sync';
import { createUserClient } from '../supabase/server';
import { checkDemoQuota } from '../limits';
import { notExpired } from '../widget/bots';
import { signToken, tokenSecret } from '../widget/token';
import { cloneDemoBot } from './demo';
import { requireOwnedBot } from './session';
import { normalizeOrigin, validateKnowledge, validateSettings, type KnowledgeInput } from './validate';

// Server actions are public endpoints: each one re-checks ownership through requireOwnedBot.

export type ActionResult = { error: string } | { ok: true };

export async function startDemo(): Promise<ActionResult> {
  const supabase = await createUserClient();
  const { data: claims } = await supabase.auth.getClaims();
  let userId = claims?.claims?.sub;

  // One demo per visitor: reopen the one they already have instead of cloning again.
  if (userId) {
    const { data: existing } = await supabase.from('bots').select('id').or(notExpired()).limit(1).maybeSingle();
    if (existing) redirect(`/bots/${existing.id}/knowledge`);
  }

  try {
    if (!(await checkDemoQuota(await headers()))) {
      return { error: '오늘 준비된 체험 수를 모두 사용했습니다. 내일 다시 시도해 주세요.' };
    }
  } catch (error) {
    console.error(error);
    return { error: '체험을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }

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
  const requestHeaders = await headers();
  const origin = requestHeaders.get('origin');
  // Bound to the admin app itself: the preview token skips the allowlist, so it must not be minted for another site.
  if (!origin || new URL(origin).host !== requestHeaders.get('host')) throw new Error('preview must be requested from the admin app');
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

const MAX_ORIGINS = 10;

export async function addAllowedOrigin(botId: string, input: string): Promise<ActionResult> {
  const { supabase, bot } = await requireOwnedBot(botId);
  if (bot.isDemo) return { error: '체험용 위젯은 외부 사이트에 설치할 수 없습니다.' };
  const origin = normalizeOrigin(input);
  if (!origin) return { error: 'https://shop.example.com 처럼 도메인만 입력해 주세요.' };

  const { data, error } = await supabase.from('bots').select('allowed_origins').eq('id', bot.id).single<{ allowed_origins: string[] }>();
  if (error) return { error: '도메인 목록을 불러오지 못했습니다.' };
  if (data.allowed_origins.includes(origin)) return { error: '이미 추가된 도메인입니다.' };
  if (data.allowed_origins.length >= MAX_ORIGINS) return { error: `도메인은 ${MAX_ORIGINS}개까지 추가할 수 있습니다.` };

  // shortcut: read-modify-write; two operators adding at the same moment can drop one. Use an RPC if teams arrive.
  const { error: updateError } = await supabase
    .from('bots')
    .update({ allowed_origins: [...data.allowed_origins, origin] })
    .eq('id', bot.id);
  if (updateError) {
    console.error(updateError);
    return { error: '도메인을 추가하지 못했습니다.' };
  }
  revalidatePath(`/bots/${bot.id}/install`);
  return { ok: true };
}

export async function removeAllowedOrigin(botId: string, origin: string): Promise<ActionResult> {
  const { supabase, bot } = await requireOwnedBot(botId);
  const { data, error } = await supabase.from('bots').select('allowed_origins').eq('id', bot.id).single<{ allowed_origins: string[] }>();
  if (error) return { error: '도메인 목록을 불러오지 못했습니다.' };
  const { error: updateError } = await supabase
    .from('bots')
    .update({ allowed_origins: data.allowed_origins.filter((value) => value !== origin) })
    .eq('id', bot.id);
  if (updateError) return { error: '도메인을 삭제하지 못했습니다.' };
  revalidatePath(`/bots/${bot.id}/install`);
  return { ok: true };
}

export async function setRetention(botId: string, days: number): Promise<ActionResult> {
  const { supabase, bot } = await requireOwnedBot(botId);
  if (![30, 90, 180].includes(days)) return { error: '보관 기간은 30일, 90일, 180일 중에서 고를 수 있습니다.' };
  const { error } = await supabase.from('bots').update({ retention_days: days }).eq('id', bot.id);
  if (error) return { error: '보관 기간을 바꾸지 못했습니다.' };
  revalidatePath(`/bots/${bot.id}/install`);
  return { ok: true };
}

const INQUIRY_STATUSES = ['new', 'in_progress', 'resolved'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export async function updateInquiry(botId: string, inquiryId: string, status: InquiryStatus, memo: string): Promise<ActionResult> {
  const { supabase, bot } = await requireOwnedBot(botId);
  if (!INQUIRY_STATUSES.includes(status)) return { error: '처리 상태가 올바르지 않습니다.' };
  if (memo.length > 1000) return { error: '메모는 1,000자 이내로 입력해 주세요.' };
  const { error } = await supabase
    .from('inquiries')
    .update({ status, memo: memo.trim() || null })
    .eq('id', inquiryId)
    .eq('bot_id', bot.id);
  if (error) {
    console.error(error);
    return { error: '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
  revalidatePath(`/bots/${bot.id}/inbox`);
  return { ok: true };
}

export async function deleteConversation(botId: string, conversationId: string): Promise<ActionResult> {
  const { supabase, bot } = await requireOwnedBot(botId);
  const { error } = await supabase.from('conversations').delete().eq('id', conversationId).eq('bot_id', bot.id);
  if (error) {
    console.error(error);
    return { error: '대화를 삭제하지 못했습니다.' };
  }
  revalidatePath(`/bots/${bot.id}/inbox`);
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
