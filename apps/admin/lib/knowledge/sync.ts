import { serviceClient } from '../db';
import { chunkItem } from './chunk';
import { embedTexts } from './embed';

type PendingItem = { id: string; kind: 'faq' | 'text'; title: string; body: string; version: number };

/** Embeds a bot's new or edited knowledge so the next question can use it. */
export async function syncPendingKnowledge(botId: string): Promise<number> {
  const db = serviceClient();
  const { data, error } = await db
    .from('knowledge_items')
    .select('id, kind, title, body, version')
    .eq('bot_id', botId)
    .neq('status', 'ready')
    .limit(20)
    .returns<PendingItem[]>();
  if (error) throw new Error(`knowledge lookup failed: ${error.message}`);

  for (const item of data ?? []) {
    const chunks = chunkItem(item.kind, item.title, item.body);
    try {
      const vectors = await embedTexts(chunks);
      const { error: rpcError } = await db.rpc('replace_item_chunks', {
        p_item_id: item.id,
        p_version: item.version,
        p_contents: chunks,
        p_embeddings: vectors.map((vector) => JSON.stringify(vector)),
      });
      if (rpcError) throw new Error(rpcError.message);
    } catch (cause) {
      await db.from('knowledge_items').update({ status: 'failed' }).eq('id', item.id).eq('version', item.version);
      throw cause;
    }
  }
  return data?.length ?? 0;
}
