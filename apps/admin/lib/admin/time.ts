const relative = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });

/** "방금 전", "3분 전", "2시간 전", "어제" for operator-facing timestamps. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return '방금 전';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86_400), 'day');
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('ko', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(iso));
