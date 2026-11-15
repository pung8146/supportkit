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

export type ChatOutcome = 'answered' | 'no_match' | 'verify_failed' | 'refused';

/** `${conversationId}.${secret}`: the visitor's proof that a conversation is theirs. */
export type ConversationRef = string;

export type ChatEvent =
  | { type: 'meta'; messageId: string; conversation: ConversationRef }
  | { type: 'delta'; text: string }
  | { type: 'sources'; sources: ChatSource[] }
  /** Server rejected the streamed text (no grounding); show this instead. */
  | { type: 'replace'; text: string }
  | { type: 'done'; outcome: ChatOutcome }
  | { type: 'error'; code: string; message: string };

export type HistoryMessage = {
  role: 'user' | 'assistant';
  text: string;
  sources: ChatSource[];
  outcome: ChatOutcome | 'error' | null;
};

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
