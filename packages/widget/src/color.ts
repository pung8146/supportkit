const FALLBACK = '#1f4d3f';
const HEX = /^#[0-9a-f]{6}$/i;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors. */
export function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

export const isHexColor = (value: string) => HEX.test(value);

/** Darkens the operator's brand color just enough for white button text to stay readable (4.5:1). */
export function readableAccent(hex: string): string {
  if (!isHexColor(hex)) return FALLBACK;
  let rgb = channels(hex);
  let color = hex.toLowerCase();
  while (contrast(color, '#ffffff') < 4.5) {
    rgb = rgb.map((c) => c * 0.92);
    color = toHex(rgb);
  }
  return color;
}
