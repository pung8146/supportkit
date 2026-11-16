'use client';

import { useId, useState, useTransition } from 'react';
import { deleteKnowledge, retryKnowledgeSync, saveKnowledge, type ActionResult } from '../../../../../lib/admin/actions';
import type { KnowledgeInput } from '../../../../../lib/admin/validate';

export type KnowledgeItem = KnowledgeInput & { id: string; status: 'pending' | 'ready' | 'failed' };

const STATUS: Record<KnowledgeItem['status'], string> = {
  ready: '반영됨',
  pending: '반영 중',
  failed: '반영 실패',
};

const LABELS = {
  faq: { title: '질문', body: '답변', name: '자주 묻는 질문' },
  text: { title: '제목', body: '내용', name: '안내문' },
};

function ItemForm({
  initial,
  allowKind,
  onSubmit,
  onCancel,
}: {
  initial: KnowledgeInput;
  allowKind: boolean;
  onSubmit: (input: KnowledgeInput) => Promise<ActionResult>;
  onCancel: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const labels = LABELS[values.kind];

  return (
    <form
      className="flex flex-col gap-2 border-b border-line py-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await onSubmit(values);
          if ('error' in result) setError(result.error);
        });
      }}
    >
      {allowKind && (
        <fieldset className="mb-2 flex gap-5">
          <legend className="sr-only">항목 종류</legend>
          {(['faq', 'text'] as const).map((kind) => (
            <label key={kind} className="flex items-center gap-2 text-[15px]">
              <input
                type="radio"
                name={`${id}-kind`}
                checked={values.kind === kind}
                onChange={() => setValues({ ...values, kind })}
                className="accent-action"
              />
              {LABELS[kind].name}
            </label>
          ))}
        </fieldset>
      )}
      <label htmlFor={`${id}-title`} className="text-sm font-semibold">
        {labels.title}
      </label>
      <input
        id={`${id}-title`}
        value={values.title}
        onChange={(event) => setValues({ ...values, title: event.target.value })}
        className="rounded-md border border-line bg-surface px-3 py-2 text-[15px]"
        autoFocus
      />
      <label htmlFor={`${id}-body`} className="mt-2 text-sm font-semibold">
        {labels.body}
      </label>
      <textarea
        id={`${id}-body`}
        value={values.body}
        rows={values.kind === 'faq' ? 3 : 8}
        onChange={(event) => setValues({ ...values, body: event.target.value })}
        className="rounded-md border border-line bg-surface px-3 py-2 text-[15px] leading-relaxed"
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center gap-4">
        <button type="submit" disabled={pending} className="h-10 rounded-md bg-action px-4 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? '저장하고 반영하는 중' : '저장'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted underline underline-offset-4">
          취소
        </button>
      </div>
    </form>
  );
}

function ItemRow({ botId, item }: { botId: string; item: KnowledgeItem }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (mode === 'edit') {
    return (
      <li>
        <ItemForm
          initial={{ kind: item.kind, title: item.title, body: item.body }}
          allowKind={false}
          onCancel={() => setMode('view')}
          onSubmit={async (input) => {
            const result = await saveKnowledge(botId, item.id, input);
            if ('ok' in result) setMode('view');
            return result;
          }}
        />
      </li>
    );
  }

  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await action();
      setError('error' in result ? result.error : null);
    });

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 border-b border-line py-5">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold">{item.title}</p>
        <p className="mt-1 line-clamp-3 text-[15px] leading-relaxed whitespace-pre-line text-muted">{item.body}</p>
      </div>
      <div className="flex flex-col items-end gap-2 text-sm">
        <span className={item.status === 'failed' ? 'text-danger' : 'text-muted'}>{STATUS[item.status]}</span>
        {mode === 'view' ? (
          <span className="flex gap-3">
            <button type="button" onClick={() => setMode('edit')} className="underline underline-offset-4">
              수정
            </button>
            <button type="button" onClick={() => setMode('confirm-delete')} className="text-muted underline underline-offset-4">
              삭제
            </button>
          </span>
        ) : (
          <span className="flex items-center gap-3">
            <span>삭제할까요?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteKnowledge(botId, item.id))}
              className="font-semibold text-danger underline underline-offset-4"
            >
              삭제
            </button>
            <button type="button" onClick={() => setMode('view')} className="text-muted underline underline-offset-4">
              취소
            </button>
          </span>
        )}
        {item.status === 'failed' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => retryKnowledgeSync(botId))}
            className="underline underline-offset-4"
          >
            다시 반영
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="col-span-2 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

export function KnowledgeEditor({ botId, items, draft }: { botId: string; items: KnowledgeItem[]; draft?: string }) {
  const [adding, setAdding] = useState(Boolean(draft));

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between border-b border-ink pb-3">
        <p className="text-sm text-muted">{items.length}개 항목</p>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-[15px] font-semibold text-action underline underline-offset-4">
            항목 추가
          </button>
        )}
      </div>
      {adding && (
        <ItemForm
          initial={{ kind: 'faq', title: draft ?? '', body: '' }}
          allowKind
          onCancel={() => setAdding(false)}
          onSubmit={async (input) => {
            const result = await saveKnowledge(botId, null, input);
            if ('ok' in result) setAdding(false);
            return result;
          }}
        />
      )}
      {items.length === 0 && !adding ? (
        <p className="py-10 text-[15px] text-muted">
          아직 등록한 안내가 없습니다. 배송, 환불처럼 자주 받는 질문부터 추가하면 위젯이 답할 수 있습니다.
        </p>
      ) : (
        <ul>
          {items.map((item) => (
            <ItemRow key={item.id} botId={botId} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
