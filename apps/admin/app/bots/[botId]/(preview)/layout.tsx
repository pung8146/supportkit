import type { ReactNode } from 'react';
import { requireOwnedBot } from '../../../../lib/admin/session';
import { Preview } from './preview';
import { PreviewProvider } from './preview-context';

/** Knowledge and widget settings are edited next to the live widget. */
export default async function PreviewLayout({ children, params }: { children: ReactNode; params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const { bot } = await requireOwnedBot(botId);

  return (
    <PreviewProvider initial={bot.config}>
      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_460px]">
        <main className="min-w-0 px-6 py-8 lg:px-10">{children}</main>
        <aside className="border-t border-line bg-stage px-6 py-8 lg:sticky lg:top-0 lg:max-h-dvh lg:border-t-0 lg:border-l">
          <Preview botId={bot.id} publicKey={bot.publicKey} />
        </aside>
      </div>
    </PreviewProvider>
  );
}
