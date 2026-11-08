import type { WidgetConfig } from '@supportkit/widget/protocol';

export type Bot = {
  id: string;
  publicKey: string;
  allowedOrigins: string[];
  config: WidgetConfig;
};

// shortcut: single in-code bot, replace with the bots table in phase 2.
const demoBot = (): Bot => ({
  id: 'bot_demo',
  publicKey: 'pk_demo_shop',
  allowedOrigins: (process.env.DEMO_ALLOWED_ORIGINS ?? 'http://localhost:5174').split(',').filter(Boolean),
  config: {
    botName: '소담공방 안내',
    launcherLabel: '문의하기',
    welcome: '안녕하세요. 배송, 교환, 환불에 대해 안내해 드릴게요.',
    starters: ['환불은 며칠 안에 되나요?', '배송은 얼마나 걸리나요?'],
    theme: { accent: '#1f4d3f', position: 'right' },
  },
});

export const findBotByPublicKey = (publicKey: string) => {
  const bot = demoBot();
  return bot.publicKey === publicKey ? bot : null;
};

export const findBotById = (id: string) => {
  const bot = demoBot();
  return bot.id === id ? bot : null;
};
