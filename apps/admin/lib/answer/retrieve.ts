import { serviceClient } from '../db';
import { embedTexts } from '../knowledge/embed';

export type RetrievedChunk = { title: string; content: string; similarity: number };

/**
 * Cost gate, not an accuracy gate: measured on the demo set (tests/eval/retrieval.eval.test.ts),
 * covered questions went as low as 0.218 while uncovered ones reached 0.487, so no threshold
 * separates them. Grounding is enforced by the model's [없음] and the figure verifier; this only
 * skips the LLM for questions far from everything. Re-measure when the embedding model changes.
 */
export const MIN_SIMILARITY = 0.15;

/** Nearest chunks of one bot, unfiltered. */
export async function search(botId: string, question: string, count = 5): Promise<RetrievedChunk[]> {
  const [embedding] = await embedTexts([question]);
  const { data, error } = await serviceClient().rpc('match_chunks', {
    p_bot_id: botId,
    p_embedding: JSON.stringify(embedding),
    p_count: count,
  });
  if (error) throw new Error(`retrieval failed: ${error.message}`);
  return data as RetrievedChunk[];
}

export async function retrieve(botId: string, question: string): Promise<RetrievedChunk[]> {
  return (await search(botId, question)).filter((chunk) => chunk.similarity >= MIN_SIMILARITY);
}
