'use client';

import { isHexColor, readableAccent } from '@supportkit/widget/color';
import type { WidgetConfig } from '@supportkit/widget/protocol';
import { useState, useTransition, type ReactNode } from 'react';
import { saveSettings } from '../../../../../lib/admin/actions';
import { usePreview } from '../preview-context';

const inputClass = 'rounded-md border border-line bg-surface px-3 py-2 text-[15px]';

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function WidgetSettings({ botId }: { botId: string }) {
  const { draft, setDraft, saved, setSaved } = usePreview();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (change: Partial<WidgetConfig>) => setDraft({ ...draft, ...change });
  const setTheme = (change: Partial<WidgetConfig['theme']>) => update({ theme: { ...draft.theme, ...change } });
  const starters = [...draft.starters, '', '', ''].slice(0, 3);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const shown = readableAccent(draft.theme.accent);
  const adjusted = isHexColor(draft.theme.accent) && shown !== draft.theme.accent.toLowerCase();

  return (
    <form
      className="mt-8 flex flex-col gap-7"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveSettings(botId, draft);
          if ('error' in result) return setError(result.error);
          setError(null);
          const clean = { ...draft, starters: draft.starters.map((s) => s.trim()).filter(Boolean) };
          setDraft(clean);
          setSaved(clean);
        });
      }}
    >
      <Field id="name" label="위젯 이름" hint="상담창 맨 위에 표시됩니다.">
        <input id="name" value={draft.botName} maxLength={60} onChange={(e) => update({ botName: e.target.value })} className={inputClass} />
      </Field>

      <Field id="welcome" label="환영 문구">
        <textarea
          id="welcome"
          rows={2}
          value={draft.welcome}
          maxLength={300}
          onChange={(e) => update({ welcome: e.target.value })}
          className={`${inputClass} leading-relaxed`}
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">시작 질문</legend>
        {starters.map((starter, index) => (
          <input
            key={index}
            aria-label={`시작 질문 ${index + 1}`}
            value={starter}
            maxLength={60}
            placeholder={index === 0 ? '예: 배송은 얼마나 걸리나요?' : '비워 두면 표시하지 않습니다'}
            onChange={(e) => {
              const next = [...starters];
              next[index] = e.target.value;
              update({ starters: next.filter((value) => value !== '') });
            }}
            className={inputClass}
          />
        ))}
        <p className="text-sm text-muted">방문자가 처음 열었을 때 눌러 볼 수 있는 질문입니다.</p>
      </fieldset>

      <Field id="accent" label="색상">
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="색상 고르기"
            value={isHexColor(draft.theme.accent) ? draft.theme.accent : '#1f4d3f'}
            onChange={(e) => setTheme({ accent: e.target.value })}
            className="h-10 w-12 cursor-pointer rounded-md border border-line bg-surface p-1"
          />
          <input
            id="accent"
            value={draft.theme.accent}
            maxLength={7}
            onChange={(e) => setTheme({ accent: e.target.value.trim() })}
            className={`${inputClass} w-32 font-medium`}
          />
        </div>
        {adjusted && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden className="inline-block size-4 rounded-sm" style={{ background: shown }} />
            흰 글자가 잘 보이도록 버튼은 {shown} 색으로 표시됩니다.
          </p>
        )}
      </Field>

      <Field id="launcher" label="열기 버튼 문구">
        <input
          id="launcher"
          value={draft.launcherLabel}
          maxLength={20}
          onChange={(e) => update({ launcherLabel: e.target.value })}
          className={`${inputClass} w-48`}
        />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">화면 위치</legend>
        <div className="flex gap-5">
          {(['right', 'left'] as const).map((position) => (
            <label key={position} className="flex items-center gap-2 text-[15px]">
              <input
                type="radio"
                name="position"
                checked={draft.theme.position === position}
                onChange={() => setTheme({ position })}
                className="accent-action"
              />
              {position === 'right' ? '오른쪽 아래' : '왼쪽 아래'}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-4 border-t border-line bg-paper px-6 py-4 lg:-mx-10 lg:px-10">
        <button type="submit" disabled={!dirty || pending} className="h-10 rounded-md bg-action px-5 text-sm font-semibold text-white disabled:opacity-40">
          {pending ? '저장 중' : '저장'}
        </button>
        {dirty && (
          <>
            <button type="button" onClick={() => setDraft(saved)} className="text-sm text-muted underline underline-offset-4">
              되돌리기
            </button>
            <p className="text-sm text-muted">저장하지 않은 변경 사항이 있습니다.</p>
          </>
        )}
        {error && (
          <p role="alert" className="w-full text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
