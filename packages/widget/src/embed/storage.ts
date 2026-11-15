// Storage can be blocked or partitioned in a third-party iframe; every access may throw,
// and the widget must work without it.
const key = `supportkit:${location.pathname.split('/').pop()}`;
const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function loadConversation(): string | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as { ref: string; savedAt: number } | null;
    if (saved && Date.now() - saved.savedAt < RESTORE_WINDOW_MS) return saved.ref;
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  return undefined;
}

export function saveConversation(ref: string) {
  try {
    localStorage.setItem(key, JSON.stringify({ ref, savedAt: Date.now() }));
  } catch {
    // ignore
  }
}

export function clearConversation() {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
