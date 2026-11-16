import { describe, expect, it } from 'vitest';
import { formatDate, timeAgo } from './time';

const now = Date.parse('2026-11-17T12:00:00Z');
const before = (seconds: number) => new Date(now - seconds * 1000).toISOString();

describe('timeAgo', () => {
  it.each([
    [10, '방금 전'],
    [180, '3분 전'],
    [7200, '2시간 전'],
    [86_400, '어제'],
    [3 * 86_400, '3일 전'],
  ])('%i seconds ago is %s', (seconds, expected) => {
    expect(timeAgo(before(seconds), now)).toBe(expected);
  });
});

describe('formatDate', () => {
  it('uses Korean date format in Seoul time', () => {
    expect(formatDate('2026-11-17T20:00:00Z')).toBe('2026년 11월 18일');
  });
});
