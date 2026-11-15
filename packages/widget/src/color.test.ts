import { describe, expect, it } from 'vitest';
import { contrast, readableAccent } from './color';

describe('contrast', () => {
  it('matches known WCAG ratios', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('readableAccent', () => {
  it('keeps a color that is already readable', () => {
    expect(readableAccent('#1F4D3F')).toBe('#1f4d3f');
  });

  it.each(['#ffff00', '#7fffd4', '#ff8c00', '#ffffff'])('darkens %s until white text passes 4.5:1', (hex) => {
    const result = readableAccent(hex);
    expect(contrast(result, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(result).not.toBe(hex);
  });

  it('only darkens as much as needed', () => {
    expect(contrast(readableAccent('#ff8c00'), '#ffffff')).toBeLessThan(5.2);
  });

  it.each(['red', '#fff', 'javascript:alert(1)', ''])('falls back for invalid %j', (value) => {
    expect(readableAccent(value)).toBe('#1f4d3f');
  });
});
