import { requireOwnedBot } from '../../../../../lib/admin/session';
import { KnowledgeEditor, type KnowledgeItem } from './knowledge-editor';

export default async function KnowledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ botId: string }>;
  searchParams: Promise<{ draft?: string }>;
}) {
  const { botId } = await params;
  // From the inbox: "FAQ로 추가" opens a new item with the unanswered question filled in.
  const draft = (await searchParams).draft?.slice(0, 200);
  const { supabase, bot } = await requireOwnedBot(botId);
  const { data, error } = await supabase
    .from('knowledge_items')
    .select('id, kind, title, body, status')
    .eq('bot_id', bot.id)
    .order('created_at', { ascending: true })
    .returns<KnowledgeItem[]>();
  if (error) throw new Error(`knowledge lookup failed: ${error.message}`);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-[-0.02em]">지식</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        위젯은 여기 등록한 내용으로만 답합니다. 저장하면 다음 질문부터 바로 반영되니, 오른쪽 미리보기에서 확인해 보세요.
      </p>
      <KnowledgeEditor key={draft ?? ''} botId={bot.id} items={data ?? []} draft={draft} />
    </div>
  );
}
