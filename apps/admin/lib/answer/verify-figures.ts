type Figure = { raw: string; value: number; unit: string };

const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?(?:\s?[억만천백](?:\s?\d[\d,]*)?)*`;
const UNIT = '영업일|개월|시간|주일|퍼센트|달|주|일|년|분|시|원|%|개|회|번|박';
const FIGURE = new RegExp(`(${NUMBER})\\s?(${UNIT})?`, 'g');

const WORDS: [RegExp, number, string][] = [
  [/하루/g, 1, '일'],
  [/이틀/g, 2, '일'],
  [/사흘/g, 3, '일'],
  [/나흘/g, 4, '일'],
  [/닷새/g, 5, '일'],
  [/엿새/g, 6, '일'],
  [/열흘/g, 10, '일'],
  [/보름/g, 15, '일'],
  [/일주일/g, 7, '일'],
  [/한\s?달/g, 1, '개월'],
  [/두\s?달/g, 2, '개월'],
  [/석\s?달/g, 3, '개월'],
  [/무료/g, 0, '원'],
];

const MAGNITUDES: Record<string, number> = { 백: 100, 천: 1_000, 만: 10_000, 억: 100_000_000 };

function parseKoreanNumber(text: string): number {
  let total = 0;
  let section = 0;
  let current = 0;
  for (const token of text.replace(/[,\s]/g, '').match(/\d+(?:\.\d+)?|[억만천백]/g) ?? []) {
    const magnitude = MAGNITUDES[token];
    if (magnitude === undefined) current = Number(token);
    else if (magnitude < 10_000) {
      section += current * magnitude;
      current = 0;
    } else {
      total += (section + current) * magnitude;
      section = 0;
      current = 0;
    }
  }
  return total + section + current;
}

function normalize(value: number, unit: string): { value: number; unit: string } {
  if (unit === '주' || unit === '주일') return { value: value * 7, unit: '일' };
  if (unit === '달') return { value, unit: '개월' };
  if (unit === '퍼센트') return { value, unit: '%' };
  if (unit === '번') return { value, unit: '회' };
  return { value, unit };
}

function extractFigures(input: string): Figure[] {
  // Citation markers and list numbering are not claims.
  const text = input.replace(/\[s?\d+\]/g, ' ').replace(/^\s*\d+[.)]\s/gm, ' ');
  const figures: (Figure & { end: number; index: number })[] = [];

  for (const match of text.matchAll(FIGURE)) {
    const { value, unit } = normalize(parseKoreanNumber(match[1]!), match[2] ?? '');
    figures.push({ raw: match[0].trim(), value, unit, index: match.index, end: match.index + match[0].length });
  }

  // "1~2일": the lower bound takes the unit written after the upper bound.
  figures.forEach((figure, index) => {
    const next = figures[index + 1];
    if (!figure.unit && next && /^\s*[~\-–]\s*$/.test(text.slice(figure.end, next.index))) {
      const scaled = next.unit === '일' && /주/.test(text.slice(next.index, next.end)) ? 7 : 1;
      figure.value *= scaled;
      figure.unit = next.unit;
    }
  });

  for (const [pattern, value, unit] of WORDS) {
    for (const match of text.matchAll(pattern)) figures.push({ raw: match[0], value, unit, index: 0, end: 0 });
  }
  return figures;
}

const key = (figure: Figure) => `${figure.value}|${figure.unit}`;

/**
 * Every number, price and duration in the answer must exist in its sources.
 * Ambiguous cases fail on purpose: a wrong refusal costs less than an invented policy.
 */
export function verifyFigures(answer: string, sources: string[]): { ok: boolean; unsupported: string[] } {
  const known = sources.flatMap(extractFigures);
  const knownKeys = new Set(known.map(key));
  const knownValues = new Set(known.map((figure) => figure.value));

  const unsupported = extractFigures(answer)
    .filter((figure) => (figure.unit ? !knownKeys.has(key(figure)) : !knownValues.has(figure.value)))
    .map((figure) => figure.raw);

  return { ok: unsupported.length === 0, unsupported };
}
