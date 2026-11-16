'use client';

import { useState, useTransition } from 'react';
import { addAllowedOrigin, removeAllowedOrigin, setRetention, type ActionResult } from '../../../../lib/admin/actions';

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult>, onOk?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if ('error' in result) setError(result.error);
      else {
        setError(null);
        onOk?.();
      }
    });
  return { error, pending, run };
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="h-10 rounded-md bg-action px-4 text-sm font-semibold text-white"
      >
        코드 복사
      </button>
      <span aria-live="polite" className="ml-3 text-sm text-muted">
        {copied ? '복사했습니다' : ''}
      </span>
    </>
  );
}

export function OriginList({ botId, origins, blocked }: { botId: string; origins: string[]; blocked: string | null }) {
  const [input, setInput] = useState('');
  const { error, pending, run } = useAction();

  return (
    <div>
      <p className="text-[15px] leading-relaxed text-muted">여기 없는 사이트에서는 위젯이 열리지 않습니다.</p>
      {origins.length > 0 && (
        <ul className="mt-3 border-t border-line">
          {origins.map((origin) => (
            <li key={origin} className="flex items-center justify-between border-b border-line py-3 text-[15px]">
              <span>{origin}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => removeAllowedOrigin(botId, origin))}
                className="text-sm text-muted underline underline-offset-4"
                aria-label={`${origin} 삭제`}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => addAllowedOrigin(botId, input), () => setInput(''));
        }}
      >
        <label htmlFor="origin" className="sr-only">
          도메인
        </label>
        <input
          id="origin"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="shop.example.com"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-[15px]"
        />
        <button type="submit" disabled={pending || !input.trim()} className="h-10 rounded-md bg-action px-4 text-sm font-semibold text-white disabled:opacity-40">
          추가
        </button>
      </form>
      <p className="mt-2 text-sm text-muted">하위 도메인을 모두 허용하려면 *.example.com 처럼 입력합니다. 테스트용 localhost도 넣을 수 있습니다.</p>
      {blocked && (
        <p className="mt-3 text-[15px]">
          최근 {blocked}에서 막힌 요청이 있었습니다.{' '}
          <button type="button" disabled={pending} onClick={() => run(() => addAllowedOrigin(botId, blocked))} className="font-semibold text-action underline underline-offset-4">
            이 도메인 허용
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function RetentionPicker({ botId, days }: { botId: string; days: 30 | 90 | 180 }) {
  const [value, setValue] = useState(days);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (option: 30 | 90 | 180) => {
    const previous = value;
    setValue(option);
    startTransition(async () => {
      const result = await setRetention(botId, option);
      setError('error' in result ? result.error : null);
      if ('error' in result) setValue(previous);
    });
  };
  return (
    <fieldset className="mt-3">
      <legend className="sr-only">대화 보관 기간</legend>
      <div className="flex gap-5">
        {([30, 90, 180] as const).map((option) => (
          <label key={option} className="flex items-center gap-2 text-[15px]">
            <input
              type="radio"
              name="retention"
              checked={value === option}
              disabled={pending}
              onChange={() => choose(option)}
              className="accent-action"
            />
            {option}일
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
