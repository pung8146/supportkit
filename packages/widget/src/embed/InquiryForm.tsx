import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { INQUIRY_CONSENT_TEXT, validateInquiry, type InquiryErrors, type InquiryInput } from '../inquiry';

type Props = {
  question: string;
  onSubmit: (input: InquiryInput) => Promise<void>;
  onCancel: () => void;
};

export function InquiryForm({ question, onSubmit, onCancel }: Props) {
  const id = useId();
  const ids = { question: `${id}-q`, contact: `${id}-c`, consent: `${id}-a` };
  const [values, setValues] = useState<InquiryInput>({ question, contact: '', consent: false });
  const [errors, setErrors] = useState<InquiryErrors>({});
  const [state, setState] = useState<'idle' | 'sending' | 'failed'>('idle');
  const contactRef = useRef<HTMLInputElement>(null);

  useEffect(() => contactRef.current?.focus(), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateInquiry(values);
    setErrors(found);
    const first = (['question', 'contact', 'consent'] as const).find((field) => found[field]);
    if (first) {
      document.getElementById(ids[first])?.focus();
      return;
    }
    setState('sending');
    try {
      await onSubmit(values);
    } catch {
      setState('failed');
    }
  };

  const describedBy = (field: keyof InquiryInput) => (errors[field] ? `${ids[field]}-error` : undefined);
  const error = (field: keyof InquiryInput) =>
    errors[field] && (
      <p id={`${ids[field]}-error`} className="field-error">
        {errors[field]}
      </p>
    );

  return (
    <form className="inquiry" onSubmit={submit} noValidate aria-label="담당자에게 문의 남기기">
      <label htmlFor={ids.question}>문의 내용</label>
      <textarea
        id={ids.question}
        rows={3}
        value={values.question}
        aria-invalid={Boolean(errors.question)}
        aria-describedby={describedBy('question')}
        onChange={(event) => setValues({ ...values, question: event.target.value })}
      />
      {error('question')}

      <label htmlFor={ids.contact}>연락받을 이메일 또는 전화번호</label>
      <input
        id={ids.contact}
        ref={contactRef}
        value={values.contact}
        autoComplete="email"
        aria-invalid={Boolean(errors.contact)}
        aria-describedby={describedBy('contact')}
        onChange={(event) => setValues({ ...values, contact: event.target.value })}
      />
      {error('contact')}

      <label className="consent" htmlFor={ids.consent}>
        <input
          id={ids.consent}
          type="checkbox"
          checked={values.consent}
          aria-invalid={Boolean(errors.consent)}
          aria-describedby={describedBy('consent')}
          onChange={(event) => setValues({ ...values, consent: event.target.checked })}
        />
        <span>{INQUIRY_CONSENT_TEXT} (필수)</span>
      </label>
      {error('consent')}

      {state === 'failed' && (
        <p className="field-error" role="alert">
          접수하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      <div className="inquiry-actions">
        <button type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? '접수 중' : '문의 접수'}
        </button>
        <button type="button" className="inline" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  );
}
