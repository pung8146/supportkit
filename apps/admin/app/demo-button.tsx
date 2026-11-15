'use client';

import { useActionState } from 'react';
import { startDemo, type ActionResult } from '../lib/admin/actions';

export function DemoButton() {
  const [state, action, pending] = useActionState<ActionResult | null>(startDemo, null);
  return (
    <form action={action}>
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-lg bg-action px-6 text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? '샘플 위젯 준비 중' : '샘플 위젯으로 체험하기'}
      </button>
      {state && 'error' in state && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
