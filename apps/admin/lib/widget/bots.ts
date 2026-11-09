import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { WidgetConfig } from '@supportkit/widget/protocol';

export type Bot = {
  id: string;
  publicKey: string;
  allowedOrigins: string[];
  config: WidgetConfig;
};

type BotRow = {
  id: string;
  public_key: string;
  name: string;
  launcher_label: string;
  welcome: string;
  starters: string[];
  theme: WidgetConfig['theme'];
  allowed_origins: string[];
};

const COLUMNS = 'id, public_key, name, launcher_label, welcome, starters, theme, allowed_origins';

let client: SupabaseClient | undefined;

// service_role bypasses RLS: callers must scope every query to a bot from a verified token or public key.
function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

function toBot(row: BotRow): Bot {
  return {
    id: row.id,
    publicKey: row.public_key,
    allowedOrigins: row.allowed_origins,
    config: {
      botName: row.name,
      launcherLabel: row.launcher_label,
      welcome: row.welcome,
      starters: row.starters,
      theme: row.theme,
    },
  };
}

async function findBot(column: 'id' | 'public_key', value: string): Promise<Bot | null> {
  const { data, error } = await serviceClient().from('bots').select(COLUMNS).eq(column, value).maybeSingle<BotRow>();
  // Throw so an outage is never reported to the caller as "bot not found".
  if (error) throw new Error(`bot lookup failed: ${error.message}`);
  return data ? toBot(data) : null;
}

export const findBotByPublicKey = (publicKey: string) => findBot('public_key', publicKey);
export const findBotById = (id: string) => findBot('id', id);
