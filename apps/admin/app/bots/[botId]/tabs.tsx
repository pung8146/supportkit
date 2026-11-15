'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { segment: 'knowledge', label: '지식' },
  { segment: 'widget', label: '위젯' },
];

export function Tabs({ botId }: { botId: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="봇 설정" className="mt-4 flex gap-7">
      {TABS.map(({ segment, label }) => {
        const href = `/bots/${botId}/${segment}`;
        const active = pathname === href;
        return (
          <Link
            key={segment}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 pb-3 text-[15px] ${active ? 'border-action font-semibold' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
