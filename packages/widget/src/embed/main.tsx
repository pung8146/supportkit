import { createRoot } from 'react-dom/client';
import { readableAccent } from '../color';
import type { BootstrapResponse, FrameMessage, LoaderMessage, WidgetConfig } from '../protocol';
import { App, fromHistory } from './App';
import { clearConversation, loadConversation } from './storage';
import { restoreConversation, type TokenSource } from './stream';
import './styles.css';

let session: BootstrapResponse | undefined;
let pendingRefresh: { resolve: () => void; reject: (error: Error) => void } | undefined;
const openListeners = new Set<() => void>();

// Before init the parent origin is unknown; sk:ready carries no data, and frame-ancestors limits who can be the parent.
const postToLoader = (message: FrameMessage) => window.parent.postMessage(message, session?.origin ?? '*');

const auth: TokenSource = {
  token: () => session?.token ?? '',
  refresh: () =>
    new Promise<void>((resolve, reject) => {
      pendingRefresh = { resolve, reject };
      postToLoader({ type: 'sk:token-expired' });
    }),
};

const root = createRoot(document.getElementById('root')!);
let render: ((config: WidgetConfig) => void) | undefined;

async function start(current: BootstrapResponse) {
  const saved = loadConversation();
  // A failed restore starts a fresh conversation rather than blocking the widget.
  const history = saved ? await restoreConversation(saved, auth).catch(() => undefined) : undefined;
  if (saved && history === null) clearConversation();
  const initialMessages = history ? fromHistory(history) : [];
  const initialConversation = history ? saved : undefined;

  // Re-rendering the same App keeps the conversation while settings change in the admin preview.
  render = (config) => {
    document.documentElement.style.setProperty('--accent', readableAccent(config.theme.accent));
    root.render(
      <App
        config={config}
        auth={auth}
        initialMessages={initialMessages}
        initialConversation={initialConversation}
        onClose={() => postToLoader({ type: 'sk:close' })}
        subscribeOpen={(listener) => {
          openListeners.add(listener);
          return () => openListeners.delete(listener);
        }}
      />,
    );
  };
  render(current.config);
}

window.addEventListener('message', (event: MessageEvent<LoaderMessage>) => {
  if (event.source !== window.parent) return;
  if (session && event.origin !== session.origin) return;

  switch (event.data?.type) {
    case 'sk:init': {
      const firstInit = !session;
      session = event.data.session;
      pendingRefresh?.resolve();
      pendingRefresh = undefined;
      if (firstInit) void start(session);
      break;
    }
    case 'sk:init-failed':
      pendingRefresh?.reject(new Error('session refresh failed'));
      pendingRefresh = undefined;
      break;
    case 'sk:open':
      openListeners.forEach((listener) => listener());
      break;
    case 'sk:config':
      // A host site must not restyle or reword the widget; only the owner's admin preview may.
      if (session?.preview) render?.(event.data.config);
      break;
  }
});

postToLoader({ type: 'sk:ready' });
