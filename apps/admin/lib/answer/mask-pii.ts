// Order matters: longer digit patterns must be consumed before phone numbers.
const RULES: [RegExp, string][] = [
  [/(?<!\d)\d{6}[- ]?[1-8]\d{6}(?!\d)/g, '[주민등록번호]'],
  [/(?<!\d)\d{4}([- ]?)\d{4}\1\d{4}\1\d{3,4}(?!\d)/g, '[카드번호]'],
  [/(?<![\d-])(?:\+?82[- ]?|0)1[016789][- .]?\d{3,4}[- .]?\d{4}(?!\d)/g, '[전화번호]'],
  [/(?<![\d-])0(?:2|[3-6]\d)[- .]?\d{3,4}[- .]?\d{4}(?!\d)/g, '[전화번호]'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[이메일]'],
];

/**
 * Removes identifiers with a recognizable format before text reaches storage or the LLM.
 * shortcut: names, addresses and bank accounts have no reliable pattern, the widget asks visitors not to enter them.
 */
export function maskPII(text: string): string {
  return RULES.reduce((masked, [pattern, label]) => masked.replace(pattern, label), text);
}
