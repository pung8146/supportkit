export const MAX_MESSAGE_LENGTH = 500;

export type WidgetConfig = {
  botName: string;
  launcherLabel: string;
  welcome: string;
  starters: string[];
  theme: { accent: string; position: 'left' | 'right' };
};

export type BootstrapResponse = {
  token: string;
  origin: string;
  config: WidgetConfig;
};

export type ChatSource = { title: string };

export type ChatEvent =
  | { type: 'meta'; messageId: string }
  | { type: 'delta'; text: string }
  | { type: 'sources'; sources: ChatSource[] }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string };

/** iframe to loader */
export type FrameMessage =
  | { type: 'sk:ready' }
  | { type: 'sk:close' }
  | { type: 'sk:token-expired' };

/** loader to iframe */
export type LoaderMessage =
  | { type: 'sk:init'; session: BootstrapResponse }
  | { type: 'sk:init-failed' }
  | { type: 'sk:open' };
