import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { requireOwnedBot } from '../../../../lib/admin/session';
import { timeAgo } from '../../../../lib/admin/time';
import { CopyButton, OriginList, RetentionPicker } from './install-controls';

type InstallRow = {
  allowed_origins: string[];
  retention_days: 30 | 90 | 180;
  last_seen_origin: string | null;
  last_seen_at: string | null;
  last_blocked_origin: string | null;
  last_blocked_at: string | null;
};

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-b border-line py-8 first:pt-2">
      <span aria-hidden className="text-2xl leading-none font-bold text-muted">
        {number}
      </span>
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </li>
  );
}

export default async function InstallPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const { supabase, bot } = await requireOwnedBot(botId);
  const { data, error } = await supabase
    .from('bots')
    .select('allowed_origins, retention_days, last_seen_origin, last_seen_at, last_blocked_origin, last_blocked_at')
    .eq('id', bot.id)
    .single<InstallRow>();
  if (error) throw new Error(`install lookup failed: ${error.message}`);

  const requestHeaders = await headers();
  const appOrigin = `${requestHeaders.get('x-forwarded-proto') ?? 'http'}://${requestHeaders.get('host')}`;
  const snippet = `<script src="${appOrigin}/widget/loader.js" data-bot="${bot.publicKey}" async></script>`;
  const blocked =
    data.last_blocked_origin && !data.allowed_origins.includes(data.last_blocked_origin) ? data.last_blocked_origin : null;

  return (
    <main className="max-w-3xl flex-1 px-6 py-8 lg:px-10">
      <h1 className="text-2xl font-bold tracking-[-0.02em]">설치</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">세 단계면 고객 사이트에 위젯이 나타납니다.</p>

      <ol className="mt-6">
        <Step number={1} title="위젯을 띄울 사이트 도메인 추가">
          {bot.isDemo ? (
            <p className="text-[15px] leading-relaxed text-muted">
              체험용 위젯은 외부 사이트에 설치할 수 없습니다. 미리보기에서 동작을 확인해 보세요.
            </p>
          ) : (
            <OriginList botId={bot.id} origins={data.allowed_origins} blocked={blocked} />
          )}
        </Step>

        <Step number={2} title="사이트에 코드 붙이기">
          <p className="text-[15px] leading-relaxed text-muted">
            모든 페이지의 <code className="text-ink">&lt;/body&gt;</code> 바로 위에 붙입니다. React가 아닌 일반 HTML 사이트에서도 동작합니다.
          </p>
          <pre tabIndex={0} aria-label="설치 코드" className="mt-3 overflow-x-auto rounded-md border border-line bg-surface p-4 text-[13px] leading-relaxed">
            <code>{snippet}</code>
          </pre>
          <div className="mt-3">
            <CopyButton text={snippet} />
          </div>
          <details className="mt-5 text-[15px]">
            <summary className="cursor-pointer text-muted">사이트에 콘텐츠 보안 정책(CSP)을 쓰고 있다면</summary>
            <p className="mt-2 leading-relaxed text-muted">아래 세 항목에 이 주소를 추가해야 위젯이 열립니다.</p>
            <pre tabIndex={0} aria-label="CSP 설정" className="mt-2 overflow-x-auto rounded-md border border-line bg-surface p-4 text-[13px] leading-relaxed">
              <code>{`script-src ${appOrigin}\nframe-src ${appOrigin}\nconnect-src ${appOrigin}`}</code>
            </pre>
          </details>
        </Step>

        <Step number={3} title="설치 확인">
          {data.last_seen_origin && data.last_seen_at ? (
            <p className="text-[15px]">
              <span className="font-semibold">{data.last_seen_origin}</span>에서 {timeAgo(data.last_seen_at)} 위젯이 열렸습니다.
            </p>
          ) : (
            <p className="text-[15px] leading-relaxed text-muted">
              아직 설치가 감지되지 않았습니다. 코드를 붙인 페이지를 한 번 열면 여기에 표시됩니다.
            </p>
          )}
          {blocked && data.last_blocked_at && (
            <p className="mt-2 text-[15px] leading-relaxed text-danger">
              {blocked}에서 {timeAgo(data.last_blocked_at)} 위젯을 열려고 했지만 허용 목록에 없어 막았습니다.
            </p>
          )}
        </Step>
      </ol>

      <section aria-labelledby="retention-title" className="mt-10">
        <h2 id="retention-title" className="text-lg font-bold">
          대화 보관 기간
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">기간이 지난 대화는 자동으로 삭제됩니다. 바꾼 기간은 새 대화부터 적용됩니다.</p>
        <RetentionPicker botId={bot.id} days={data.retention_days} />
      </section>
    </main>
  );
}
