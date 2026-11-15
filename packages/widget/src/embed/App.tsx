import { useCallback, useEffect, useRef, useState } from 'react';
import type { InquiryInput } from '../inquiry';
import { MAX_MESSAGE_LENGTH, type ChatOutcome, type ChatSource, type HistoryMessage, type WidgetConfig } from '../protocol';
import { InquiryForm } from './InquiryForm';
import { clearConversation, saveConversation } from './storage';
import { openChat, submitInquiry, type TokenSource } from './stream';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status: 'waiting' | 'streaming' | 'done' | 'stopped' | 'error';
  question?: string;
  sources?: ChatSource[];
  outcome?: ChatOutcome;
  inquiry?: 'open' | 'sent';
};

export function fromHistory(history: HistoryMessage[]): Message[] {
  let question = '';
  return history.map((message) => {
    if (message.role === 'user') {
      question = message.text;
      return { id: crypto.randomUUID(), role: 'user', text: message.text, status: 'done' };
    }
    const { outcome } = message;
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: message.text,
      status: outcome === 'error' ? 'error' : 'done',
      question,
      sources: message.sources,
      outcome: outcome === 'error' || outcome === null ? undefined : outcome,
    };
  });
}

type Props = {
  config: WidgetConfig;
  auth: TokenSource;
  initialMessages: Message[];
  initialConversation?: string;
  onClose: () => void;
  subscribeOpen: (listener: () => void) => () => void;
};

export function App({ config, auth, initialMessages, initialConversation, onClose, subscribeOpen }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const conversationRef = useRef(initialConversation);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const patch = useCallback((id: string, change: Partial<Message>) => {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, ...change } : message)));
  }, []);

  const answer = useCallback(
    async (id: string, question: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      patch(id, { text: '', status: 'waiting', sources: undefined, outcome: undefined, inquiry: undefined });

      let text = '';
      let frame = 0;
      // One React update per display frame, however fast tokens arrive.
      const flush = () => {
        frame = 0;
        patch(id, { text, status: 'streaming' });
      };

      try {
        const events = await openChat(question, conversationRef.current, auth, controller.signal);
        for await (const event of events) {
          if (event.type === 'meta') {
            conversationRef.current = event.conversation;
            saveConversation(event.conversation);
          } else if (event.type === 'delta') {
            text += event.text;
            frame ||= requestAnimationFrame(flush);
          } else if (event.type === 'replace') {
            text = event.text;
            frame ||= requestAnimationFrame(flush);
          } else if (event.type === 'sources') {
            patch(id, { sources: event.sources });
          } else if (event.type === 'done') {
            patch(id, { outcome: event.outcome });
          } else if (event.type === 'error') {
            throw new Error(event.code);
          }
        }
        cancelAnimationFrame(frame);
        patch(id, { text, status: 'done' });
        setAnnouncement(text);
      } catch {
        cancelAnimationFrame(frame);
        const stopped = controller.signal.aborted;
        patch(id, { text, status: stopped ? 'stopped' : 'error' });
        if (!stopped) setAnnouncement('답변을 가져오지 못했습니다. 다시 시도할 수 있습니다.');
      } finally {
        setBusy(false);
      }
    },
    [auth, patch],
  );

  const send = (value: string) => {
    const question = value.trim();
    if (!question || busy) return;
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', text: question, status: 'done' },
      { id: assistantId, role: 'assistant', text: '', status: 'waiting', question },
    ]);
    setDraft('');
    void answer(assistantId, question);
  };

  const startOver = () => {
    abortRef.current?.abort();
    conversationRef.current = undefined;
    clearConversation();
    setMessages([]);
    setAnnouncement('새 대화를 시작했습니다.');
    inputRef.current?.focus();
  };

  const sendInquiry = async (id: string, input: InquiryInput) => {
    await submitInquiry({ ...input, conversation: conversationRef.current }, auth);
    patch(id, { inquiry: 'sent' });
    setAnnouncement('문의가 접수되었습니다.');
    inputRef.current?.focus();
  };

  useEffect(() => {
    const focusInput = () => inputRef.current?.focus();
    focusInput();
    return subscribeOpen(focusInput);
  }, [subscribeOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages]);

  return (
    <section className="panel" aria-labelledby="panel-title">
      <header className="header">
        <h1 id="panel-title">{config.botName}</h1>
        <div className="header-actions">
          {messages.length > 0 && (
            <button type="button" className="close" onClick={startOver}>
              새 대화
            </button>
          )}
          <button type="button" className="close" onClick={onClose} aria-label="상담창 닫기">
            닫기
          </button>
        </div>
      </header>

      <div className="log" ref={logRef}>
        <p className="answer">{config.welcome}</p>

        {messages.length === 0 && (
          <div className="starters">
            {config.starters.map((starter) => (
              <button type="button" key={starter} onClick={() => send(starter)}>
                {starter}
              </button>
            ))}
          </div>
        )}

        {messages.map((message) =>
          message.role === 'user' ? (
            <p key={message.id} className="question">
              {message.text}
            </p>
          ) : (
            <div key={message.id} className="reply" data-status={message.status}>
              {message.status === 'waiting' && <p className="status">안내 문서 확인 중</p>}
              {message.text && <p className="answer">{message.text}</p>}
              {message.status === 'stopped' && <p className="status">답변을 중단했습니다.</p>}
              {message.status === 'error' && (
                <p className="status">
                  답변을 가져오지 못했습니다.{' '}
                  <button type="button" className="inline" disabled={busy} onClick={() => void answer(message.id, message.question ?? '')}>
                    다시 시도
                  </button>
                </p>
              )}
              {message.status === 'done' && message.sources && message.sources.length > 0 && (
                <p className="sources">근거 · {message.sources.map((source) => source.title).join(', ')}</p>
              )}
              {message.status === 'done' && message.outcome && message.outcome !== 'answered' && (
                <>
                  {message.inquiry === 'sent' && <p className="status">문의가 접수되었어요. 담당자가 확인 후 연락드릴게요.</p>}
                  {message.inquiry === 'open' && (
                    <InquiryForm
                      question={message.question ?? ''}
                      onSubmit={(input) => sendInquiry(message.id, input)}
                      onCancel={() => patch(message.id, { inquiry: undefined })}
                    />
                  )}
                  {!message.inquiry && (
                    <button type="button" className="secondary" onClick={() => patch(message.id, { inquiry: 'open' })}>
                      담당자에게 문의 남기기
                    </button>
                  )}
                </>
              )}
            </div>
          ),
        )}
      </div>

      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="무엇이든 물어보세요"
          aria-label="질문 입력"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter during Korean IME composition only confirms the syllable.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send(draft);
            }
          }}
        />
        {busy ? (
          <button type="button" onClick={() => abortRef.current?.abort()}>
            중단
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()}>
            보내기
          </button>
        )}
      </form>
      <p className="note">AI가 등록된 안내를 바탕으로 답변합니다. 개인정보는 입력하지 마세요.</p>
    </section>
  );
}
