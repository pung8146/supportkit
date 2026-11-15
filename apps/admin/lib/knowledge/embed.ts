const MODEL = 'text-embedding-3-small';

export async function embedTexts(texts: string[]): Promise<number[][]> {
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
