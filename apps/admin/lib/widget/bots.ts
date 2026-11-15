import type { WidgetConfig } from '@supportkit/widget/protocol';
import { serviceClient } from '../db';

export type Bot = {
  id: string;
  publicKey: string;
  allowedOrigins: string[];
  fallback: string;
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
  fallback: string;
};

const COLUMNS = 'id, public_key, name, launcher_label, welcome, starters, theme, allowed_origins, fallback';

function toBot(row: BotRow): Bot {
  return {
    id: row.id,
    publicKey: row.public_key,
    allowedOrigins: row.allowed_origins,
    fallback: row.fallback,
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
