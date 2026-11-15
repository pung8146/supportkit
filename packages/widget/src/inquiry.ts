// Shared by the widget form and the API so both reject the same input.

/** Bump the version whenever the consent text changes; each inquiry stores the version it agreed to. */
export const INQUIRY_CONSENT_VERSION = 'v1';
export const INQUIRY_CONSENT_TEXT = '문의 답변을 위해 연락처를 수집하며, 처리 완료 후 90일 뒤 삭제합니다.';

export type InquiryInput = { question: string; contact: string; consent: boolean };
export type InquiryErrors = Partial<Record<keyof InquiryInput, string>>;

export function validateInquiry(input: InquiryInput): InquiryErrors {
  const errors: InquiryErrors = {};

  const question = input.question.trim();
  if (!question) errors.question = '문의 내용을 입력해 주세요.';
  else if (question.length > 1000) errors.question = '문의 내용은 1,000자 이내로 입력해 주세요.';

  const contact = input.contact.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const isPhone = /^\d{9,15}$/.test(contact.replace(/[\s()+-]/g, ''));
  if (!contact) errors.contact = '연락받을 이메일이나 전화번호를 입력해 주세요.';
  else if (contact.length > 100 || (!isEmail && !isPhone)) errors.contact = '이메일 또는 전화번호 형식으로 입력해 주세요.';

  if (!input.consent) errors.consent = '개인정보 수집에 동의해야 접수할 수 있어요.';
  return errors;
}
