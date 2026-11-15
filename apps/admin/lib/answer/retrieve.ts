import { serviceClient } from '../db';
import { embedTexts } from '../knowledge/embed';

export type RetrievedChunk = { title: string; content: string; similarity: number };

// shortcut: provisional threshold, calibrate against the eval set once embeddings can run.
export const MIN_SIMILARITY = 0.3;

export async function retrieve(botId: string, question: string): Promise<RetrievedChunk[]> {
  const [embedding] = await embedTexts([question]);
  const { data, error } = await serviceClient().rpc('match_chunks', {
    p_bot_id: botId,
    p_embedding: JSON.stringify(embedding),
    p_count: 5,
  });
  if (error) throw new Error(`retrieval failed: ${error.message}`);
  return (data as RetrievedChunk[]).filter((chunk) => chunk.similarity >= MIN_SIMILARITY);
}
