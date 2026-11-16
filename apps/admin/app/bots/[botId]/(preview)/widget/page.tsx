import { requireOwnedBot } from '../../../../../lib/admin/session';
import { WidgetSettings } from './widget-settings';

export default async function WidgetPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const { bot } = await requireOwnedBot(botId);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold tracking-[-0.02em]">위젯</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        바꾸는 즉시 오른쪽 미리보기에 보입니다. 방문자에게는 저장한 뒤부터 적용됩니다.
      </p>
      <WidgetSettings botId={bot.id} />
    </div>
  );
}
