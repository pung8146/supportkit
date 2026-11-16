import type { WidgetConfig } from '@supportkit/widget/protocol';
import { serviceClient } from '../db';

export type Bot = {
  id: string;
  /** null for the system-owned demo bot */
  ownerId: string | null;
  publicKey: string;
  allowedOrigins: string[];
  fallback: string;
  retentionDays: number;
  monthlyLimit: number;
  config: WidgetConfig;
};

type BotRow = {
  id: string;
  owner_id: string | null;
  public_key: string;
  name: string;
  launcher_label: string;
  welcome: string;
  starters: string[];
  theme: WidgetConfig['theme'];
  allowed_origins: string[];
  fallback: string;
  retention_days: number;
  monthly_limit: number;
};

const COLUMNS =
  'id, owner_id, public_key, name, launcher_label, welcome, starters, theme, allowed_origins, fallback, retention_days, monthly_limit';

function toBot(row: BotRow): Bot {
  return {
    id: row.id,
    ownerId: row.owner_id,
    publicKey: row.public_key,
    allowedOrigins: row.allowed_origins,
    fallback: row.fallback,
    retentionDays: row.retention_days,
    monthlyLimit: row.monthly_limit,
    config: {
      botName: row.name,
      launcherLabel: row.launcher_label,
      welcome: row.welcome,
      starters: row.starters,
      theme: row.theme,
    },
  };
}

/** PostgREST filter for bots that have not expired (demo bots expire; others have no expiry). */
export const notExpired = () => `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`;

async function findBot(column: 'id' | 'public_key', value: string): Promise<Bot | null> {
  const { data, error } = await serviceClient().from('bots').select(COLUMNS).eq(column, value).or(notExpired()).maybeSingle<BotRow>();
  // Throw so an outage is never reported to the caller as "bot not found".
  if (error) throw new Error(`bot lookup failed: ${error.message}`);
  return data ? toBot(data) : null;
}

export const findBotByPublicKey = (publicKey: string) => findBot('public_key', publicKey);
export const findBotById = (id: string) => findBot('id', id);
