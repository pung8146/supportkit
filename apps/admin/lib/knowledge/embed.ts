const MODEL = 'text-embedding-3-small';
const DIMENSIONS = 1536;

// shortcut: deterministic vectors for E2E (LLM_MODE=fake); they carry no meaning, so retrieval
// quality is only measured by the billed evals.
function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  for (let i = 0; i < text.length; i++) vector[(text.charCodeAt(i) * 31 + i) % DIMENSIONS]! += 1;
  return vector;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (process.env.LLM_MODE === 'fake') return texts.map(fakeEmbedding);

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is required');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!response.ok) throw new Error(`embedding failed: ${response.status} ${await response.text()}`);

  const { data } = (await response.json()) as { data: { index: number; embedding: number[] }[] };
  return data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}
