import type { WidgetConfig } from '@supportkit/widget/protocol';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { createUserClient } from '../supabase/server';
import { notExpired } from '../widget/bots';

export type OwnedBot = {
  id: string;
  publicKey: string;
  isDemo: boolean;
  config: WidgetConfig;
};

type Row = {
  id: string;
  public_key: string;
  is_demo: boolean;
  name: string;
  launcher_label: string;
  welcome: string;
  starters: string[];
  theme: WidgetConfig['theme'];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Verified user id from the session cookie (getClaims checks the signature), or null. */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

/**
 * Loads a bot through RLS, so it only exists if the signed-in user owns it.
 * Every admin page and server action starts here. cache() shares one lookup per request.
 */
export const requireOwnedBot = cache(async (botId: string) => {
  const supabase = await createUserClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect('/');
  if (!UUID.test(botId)) notFound();

  const { data, error } = await supabase
    .from('bots')
    .select('id, public_key, is_demo, name, launcher_label, welcome, starters, theme')
    .eq('id', botId)
    .or(notExpired())
    .maybeSingle<Row>();
  if (error) throw new Error(`bot lookup failed: ${error.message}`);
  if (!data) notFound();

  const bot: OwnedBot = {
    id: data.id,
    publicKey: data.public_key,
    isDemo: data.is_demo,
    config: {
      botName: data.name,
      launcherLabel: data.launcher_label,
      welcome: data.welcome,
      starters: data.starters,
      theme: data.theme,
    },
  };
  return { supabase, bot };
});
