const MAX_CHARS = 1000;

/** One FAQ is one chunk; longer text is split on blank lines and packed up to MAX_CHARS. */
export function chunkItem(kind: 'faq' | 'text', title: string, body: string): string[] {
  if (kind === 'faq') return [`질문: ${title.trim()}\n답변: ${body.trim()}`];

  const pieces = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => paragraph.match(new RegExp(`[\\s\\S]{1,${MAX_CHARS}}`, 'g')) ?? []);

  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > MAX_CHARS) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);

  // The title gives each chunk the context of its document.
  return chunks.map((chunk) => `${title.trim()}\n${chunk}`);
}
