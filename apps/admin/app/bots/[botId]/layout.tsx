import type { ReactNode } from 'react';
import { requireOwnedBot } from '../../../lib/admin/session';
import { Preview } from './preview';
import { PreviewProvider } from './preview-context';
import { Tabs } from './tabs';

export default async function BotLayout({ children, params }: { children: ReactNode; params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const { bot } = await requireOwnedBot(botId);

  return (
    <PreviewProvider initial={bot.config}>
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_460px]">
        <div className="flex min-w-0 flex-col">
          <header className="border-b border-line px-6 pt-5 lg:px-10">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <p className="text-[15px]">
                <span className="font-semibold">SupportKit</span>
                <span className="mx-2 text-muted">/</span>
                <span>{bot.config.botName}</span>
              </p>
              {bot.isDemo && <p className="text-sm text-muted">체험용 샘플 위젯입니다. 외부 사이트에는 설치되지 않습니다.</p>}
            </div>
            <Tabs botId={bot.id} />
          </header>
          <main className="flex-1 px-6 py-8 lg:px-10">{children}</main>
        </div>
        <aside className="border-t border-line bg-stage px-6 py-8 lg:sticky lg:top-0 lg:h-dvh lg:border-t-0 lg:border-l">
          <Preview botId={bot.id} publicKey={bot.publicKey} />
        </aside>
      </div>
    </PreviewProvider>
  );
}
