const MAX_MARKER = 8;

/**
 * Removes `[1]`, `[1, 2]` and `[없음]` markers from streamed text, holding back a possible
 * marker that is split across chunks until it can be decided.
 */
export function createCitationFilter() {
  let pending = '';
  let noAnswer = false;
  const cited = new Set<number>();

  function drain(final: boolean): string {
    let out = '';
    while (pending) {
      const open = pending.indexOf('[');
      if (open === -1) {
        out += pending;
        pending = '';
        break;
      }
      out += pending.slice(0, open);
      pending = pending.slice(open);

      const close = pending.indexOf(']');
      if (close === -1) {
        if (!final && pending.length < MAX_MARKER) break;
        out += '[';
        pending = pending.slice(1);
        continue;
      }

      const inner = pending.slice(1, close).trim();
      if (/^\d+(\s*,\s*\d+)*$/.test(inner)) inner.split(',').forEach((n) => cited.add(Number(n)));
      else if (inner === '없음') noAnswer = true;
      else out += pending.slice(0, close + 1);
      pending = pending.slice(close + 1);
    }
    return out;
  }

  return {
    push: (text: string) => {
      pending += text;
      return drain(false);
    },
    flush: () => drain(true),
    cited: () => [...cited],
    noAnswer: () => noAnswer,
  };
}
