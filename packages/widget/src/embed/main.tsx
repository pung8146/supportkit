import { createRoot } from 'react-dom/client';
import type { BootstrapResponse, FrameMessage, LoaderMessage } from '../protocol';
import { App } from './App';
import type { TokenSource } from './stream';
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

window.addEventListener('message', (event: MessageEvent<LoaderMessage>) => {
  if (event.source !== window.parent) return;
  if (session && event.origin !== session.origin) return;

  switch (event.data?.type) {
    case 'sk:init': {
      const firstInit = !session;
      session = event.data.session;
      pendingRefresh?.resolve();
      pendingRefresh = undefined;
      if (firstInit) {
        document.documentElement.style.setProperty('--accent', session.config.theme.accent);
        root.render(
          <App
            config={session.config}
            auth={auth}
            onClose={() => postToLoader({ type: 'sk:close' })}
            subscribeOpen={(listener) => {
              openListeners.add(listener);
              return () => openListeners.delete(listener);
            }}
          />,
        );
      }
      break;
    }
    case 'sk:init-failed':
      pendingRefresh?.reject(new Error('session refresh failed'));
      pendingRefresh = undefined;
      break;
    case 'sk:open':
      openListeners.forEach((listener) => listener());
      break;
  }
});

postToLoader({ type: 'sk:ready' });
