import { readableAccent } from './color';
import type { BootstrapResponse, FrameMessage, LoaderMessage } from './protocol';

const css = `
.launcher {
  position: fixed; bottom: 20px; padding: 13px 20px; border: 0; border-radius: 999px;
  background: var(--sk-accent); color: #fff; cursor: pointer;
  font: 600 15px/1 system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  box-shadow: 0 6px 20px rgb(0 0 0 / .18);
}
.launcher:focus-visible { outline: 3px solid var(--sk-accent); outline-offset: 3px; }
iframe {
  position: fixed; bottom: 20px; width: 380px; height: min(640px, calc(100dvh - 40px));
  border: 0; border-radius: 14px; background: #fff; box-shadow: 0 16px 48px rgb(0 0 0 / .22);
}
.right { right: 20px; }
.left { left: 20px; }
[hidden] { display: none; }
@media (max-width: 480px) {
  iframe { inset: 0; width: 100%; height: 100dvh; border-radius: 0; }
}
`;

const script = document.currentScript as HTMLScriptElement | null;

async function start() {
  const publicKey = script?.dataset.bot;
  if (!script || !publicKey) return;
  const base = new URL(script.src).origin;

  const bootstrap = async (): Promise<BootstrapResponse> => {
    const response = await fetch(`${base}/api/widget/bootstrap/${encodeURIComponent(publicKey)}`, {
      method: 'POST',
      credentials: 'omit',
    });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  };

  let session: BootstrapResponse;
  try {
    session = await bootstrap();
  } catch {
    console.warn('[SupportKit] 이 도메인이 허용되지 않았거나 서버에 연결할 수 없습니다.');
    return;
  }

  const host = document.createElement('div');
  host.setAttribute('data-supportkit', '');
  // Inline !important outranks host-page !important rules on this one exposed element.
  host.style.cssText = 'all: initial !important; position: fixed !important; z-index: 2147483647 !important;';
  const root = host.attachShadow({ mode: 'open' });

  // adoptedStyleSheets works on host pages whose CSP forbids inline <style>.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  root.adoptedStyleSheets = [sheet];

  const side = session.config.theme.position;
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = `launcher ${side}`;
  launcher.textContent = session.config.launcherLabel;
  launcher.style.setProperty('--sk-accent', readableAccent(session.config.theme.accent));
  root.append(launcher);
  document.body.append(host);

  let frame: HTMLIFrameElement | undefined;
  let ready = false;
  let open = false;

  const send = (message: LoaderMessage) => frame?.contentWindow?.postMessage(message, base);

  const ensureFrame = () => {
    if (frame) return frame;
    frame = document.createElement('iframe');
    frame.title = `${session.config.botName} 상담 채팅`;
    frame.className = side;
    frame.src = `${base}/embed/${encodeURIComponent(publicKey)}`;
    frame.hidden = true;
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    root.append(frame);
    return frame;
  };

  // Full-screen panel on phones: lock the page behind it and follow the on-screen keyboard.
  const phone = window.matchMedia('(max-width: 480px)');
  const root$ = document.documentElement;
  let savedOverflow: string | null = null;

  const fitToViewport = () => {
    const viewport = window.visualViewport;
    if (!frame) return;
    if (open && phone.matches && viewport) {
      frame.style.height = `${viewport.height}px`;
      frame.style.top = `${viewport.offsetTop}px`;
    } else {
      frame.style.removeProperty('height');
      frame.style.removeProperty('top');
    }
  };
  window.visualViewport?.addEventListener('resize', fitToViewport);
  window.visualViewport?.addEventListener('scroll', fitToViewport);

  const lockPage = (lock: boolean) => {
    if (lock && phone.matches && savedOverflow === null) {
      savedOverflow = root$.style.overflow;
      root$.style.overflow = 'hidden';
    } else if (!lock && savedOverflow !== null) {
      root$.style.overflow = savedOverflow;
      savedOverflow = null;
    }
  };

  const show = () => {
    const panel = ensureFrame();
    open = true;
    panel.hidden = false;
    launcher.hidden = true;
    lockPage(true);
    fitToViewport();
    panel.focus();
    if (ready) send({ type: 'sk:open' });
  };

  const hide = () => {
    open = false;
    if (frame) frame.hidden = true;
    launcher.hidden = false;
    lockPage(false);
    fitToViewport();
    launcher.focus();
  };

  launcher.addEventListener('pointerenter', ensureFrame, { once: true });
  launcher.addEventListener('focus', ensureFrame, { once: true });
  launcher.addEventListener('click', show);

  window.addEventListener('message', async (event: MessageEvent<FrameMessage>) => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== base) return;
    switch (event.data?.type) {
      case 'sk:ready':
        ready = true;
        send({ type: 'sk:init', session });
        if (open) send({ type: 'sk:open' });
        break;
      case 'sk:close':
        hide();
        break;
      case 'sk:token-expired':
        try {
          session = await bootstrap();
          send({ type: 'sk:init', session });
        } catch {
          send({ type: 'sk:init-failed' });
        }
        break;
    }
  });
}

void start();
