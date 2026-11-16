'use client';

import type { FrameMessage, LoaderMessage } from '@supportkit/widget/protocol';
import { useEffect, useRef, useState } from 'react';
import { createPreviewSession } from '../../../../lib/admin/actions';
import { usePreview } from './preview-context';

/** The real widget, framed here and driven the way loader.js drives it on a customer's site. */
export function Preview({ botId, publicKey }: { botId: string; publicKey: string }) {
  const { draft } = usePreview();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const draftRef = useRef(draft);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Set only after the message listener is attached, or a fast iframe's sk:ready is lost on a full page load.
  const [src, setSrc] = useState<string>();

  draftRef.current = draft;

  useEffect(() => {
    const send = (message: LoaderMessage) => frameRef.current?.contentWindow?.postMessage(message, location.origin);

    const onMessage = async (event: MessageEvent<FrameMessage>) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== location.origin) return;
      if (event.data?.type !== 'sk:ready' && event.data?.type !== 'sk:token-expired') return;
      try {
        const session = await createPreviewSession(botId);
        send({ type: 'sk:init', session });
        send({ type: 'sk:config', config: draftRef.current });
        send({ type: 'sk:open' });
        setReady(true);
        setFailed(false);
      } catch {
        send({ type: 'sk:init-failed' });
        setFailed(true);
      }
    };
    window.addEventListener('message', onMessage);
    setSrc(`/embed/${publicKey}`);
    return () => window.removeEventListener('message', onMessage);
  }, [botId, publicKey]);

  useEffect(() => {
    if (ready) frameRef.current?.contentWindow?.postMessage({ type: 'sk:config', config: draft } satisfies LoaderMessage, location.origin);
  }, [draft, ready]);

  return (
    <section aria-labelledby="preview-title" className="mx-auto flex h-full max-w-[380px] flex-col">
      <h2 id="preview-title" className="text-[15px] font-semibold">
        미리보기
      </h2>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-muted">
        방문자가 보는 위젯과 같은 화면입니다. 여기서 한 질문은 방문자 대화와 따로 저장됩니다.
      </p>
      {failed && (
        <p role="alert" className="mb-3 text-sm text-danger">
          미리보기를 불러오지 못했습니다. 페이지를 새로고침해 주세요.
        </p>
      )}
      <iframe
        ref={frameRef}
        src={src}
        title="위젯 미리보기"
        className="h-[min(640px,calc(100dvh-10rem))] min-h-[480px] w-full rounded-[14px] bg-white shadow-[0_12px_40px_rgb(27_30_28/0.16)]"
      />
    </section>
  );
}
