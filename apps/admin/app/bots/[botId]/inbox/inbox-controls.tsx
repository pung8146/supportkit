'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { deleteConversation, updateInquiry, type InquiryStatus } from '../../../../lib/admin/actions';
import type { InquiryRow } from '../../../../lib/admin/inbox';

const STATUSES: [InquiryStatus, string][] = [
  ['new', '처리 전'],
  ['in_progress', '처리 중'],
  ['resolved', '완료'],
];

export function InquiryStatusForm({ botId, inquiry }: { botId: string; inquiry: InquiryRow }) {
  const id = useId();
  const [status, setStatus] = useState(inquiry.status);
  const [memo, setMemo] = useState(inquiry.memo ?? '');
  const [message, setMessage] = useState<{ error?: string; saved?: boolean }>({});
  const [pending, startTransition] = useTransition();
  const dirty = status !== inquiry.status || memo !== (inquiry.memo ?? '');

  return (
    <form
      className="mt-5 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await updateInquiry(botId, inquiry.id, status, memo);
          setMessage('error' in result ? { error: result.error } : { saved: true });
        });
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">처리 상태</legend>
        <div className="flex flex-wrap gap-5">
          {STATUSES.map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-[15px]">
              <input type="radio" name={`${id}-status`} checked={status === value} onChange={() => setStatus(value)} className="accent-action" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`${id}-memo`} className="text-sm font-semibold">
        메모
      </label>
      <textarea
        id={`${id}-memo`}
        rows={2}
        value={memo}
        maxLength={1000}
        onChange={(event) => setMemo(event.target.value)}
        placeholder="처리 내용을 남겨 두면 다른 담당자도 볼 수 있습니다"
        className="rounded-md border border-line bg-surface px-3 py-2 text-[15px]"
      />
      <div className="flex items-center gap-4">
        <button type="submit" disabled={!dirty || pending} className="h-10 rounded-md bg-action px-4 text-sm font-semibold text-white disabled:opacity-40">
          {pending ? '저장 중' : '저장'}
        </button>
        <span aria-live="polite" className="text-sm text-muted">
          {message.saved && !dirty ? '저장했습니다' : ''}
        </span>
      </div>
      {message.error && (
        <p role="alert" className="text-sm text-danger">
          {message.error}
        </p>
      )}
    </form>
  );
}

export function DeleteConversation({ botId, conversationId }: { botId: string; conversationId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-8 border-t border-line pt-4 text-sm">
      {confirming ? (
        <p className="flex flex-wrap items-center gap-3">
          <span>이 대화를 삭제할까요? 되돌릴 수 없습니다. 연결된 문의는 남습니다.</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteConversation(botId, conversationId);
                if ('error' in result) setError(result.error);
                else router.replace(`/bots/${botId}/inbox?view=all`);
              })
            }
            className="font-semibold text-danger underline underline-offset-4"
          >
            삭제
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-muted underline underline-offset-4">
            취소
          </button>
        </p>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="text-muted underline underline-offset-4">
          대화 삭제
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
