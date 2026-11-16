import Link from 'next/link';
import {
  INBOX_VIEWS,
  isUnanswered,
  loadConversations,
  loadInquiries,
  loadInquiriesFor,
  loadTranscript,
  originLabel,
  type InboxView,
  type InquiryRow,
  type MessageRow,
} from '../../../../lib/admin/inbox';
import { requireOwnedBot } from '../../../../lib/admin/session';
import { formatDate, timeAgo } from '../../../../lib/admin/time';
import { DeleteConversation, InquiryStatusForm } from './inbox-controls';

const VIEW_LABELS: Record<InboxView, string> = {
  inquiries: '문의',
  unanswered: '답하지 못한 대화',
  all: '전체 대화',
};

export const STATUS_LABELS: Record<InquiryRow['status'], string> = { new: '처리 전', in_progress: '처리 중', resolved: '완료' };

const OUTCOME_NOTES: Record<string, string> = {
  no_match: '등록된 안내에서 답을 찾지 못해 안내 문구로 응답했습니다.',
  verify_failed: '답변의 금액이나 기간이 안내와 맞지 않아 안내 문구로 바꿨습니다.',
  refused: '안전 정책에 따라 답변하지 않았습니다.',
  error: '답변 중 오류가 났습니다.',
};

function Transcript({ botId, messages }: { botId: string; messages: MessageRow[] }) {
  return (
    <ol className="mt-4 flex flex-col gap-5">
      {messages.map((message, index) => {
        const question = [...messages.slice(0, index)].reverse().find((m) => m.role === 'user')?.content;
        return (
          <li key={`${message.created_at}-${index}`} className={message.role === 'user' ? 'pl-0' : 'border-l-2 border-line pl-4'}>
            <p className="text-sm font-semibold text-muted">{message.role === 'user' ? '방문자' : '위젯'}</p>
            <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap">{message.content || '(답변 없음)'}</p>
            {message.role === 'assistant' && message.sources_snapshot.length > 0 && (
              <p className="mt-1 text-sm text-muted">근거: {message.sources_snapshot.map((source) => source.title).join(', ')}</p>
            )}
            {message.role === 'assistant' && isUnanswered(message.outcome) && (
              <p className="mt-2 text-sm text-danger">
                {OUTCOME_NOTES[message.outcome!]}{' '}
                {question && (
                  <Link
                    href={`/bots/${botId}/knowledge?draft=${encodeURIComponent(question)}`}
                    className="font-semibold text-action underline underline-offset-4"
                  >
                    이 질문으로 FAQ 추가
                  </Link>
                )}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function InquiryDetail({ botId, inquiry }: { botId: string; inquiry: InquiryRow }) {
  return (
    <div className="border-b border-line pb-6">
      <h2 className="text-lg font-bold">문의</h2>
      <dl className="mt-3 grid grid-cols-[6rem_minmax(0,1fr)] gap-y-2 text-[15px]">
        <dt className="text-muted">접수</dt>
        <dd>{timeAgo(inquiry.created_at)}</dd>
        <dt className="text-muted">연락처</dt>
        <dd className="font-semibold break-all">{inquiry.contact}</dd>
        <dt className="text-muted">문의 내용</dt>
        <dd className="whitespace-pre-wrap">{inquiry.question}</dd>
      </dl>
      {inquiry.status === 'resolved' && inquiry.expires_at && (
        <p className="mt-3 text-sm text-muted">연락처는 {formatDate(inquiry.expires_at)}에 삭제됩니다.</p>
      )}
      <InquiryStatusForm key={`${inquiry.id}-${inquiry.status}`} botId={botId} inquiry={inquiry} />
    </div>
  );
}

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ botId: string }>;
  searchParams: Promise<{ view?: string; id?: string }>;
}) {
  const { botId } = await params;
  const query = await searchParams;
  const view: InboxView = INBOX_VIEWS.includes(query.view as InboxView) ? (query.view as InboxView) : 'inquiries';
  const { supabase, bot } = await requireOwnedBot(botId);

  const inquiries = await loadInquiries(supabase, bot.id);
  const openCount = inquiries.filter((row) => row.status !== 'resolved').length;
  const conversations = view === 'inquiries' ? [] : await loadConversations(supabase, bot.id, view === 'unanswered');

  const selectedInquiry = view === 'inquiries' ? inquiries.find((row) => row.id === query.id) : undefined;
  const conversationId = view === 'inquiries' ? selectedInquiry?.conversation_id : query.id;
  const transcript = conversationId ? await loadTranscript(supabase, conversationId) : null;
  const linkedInquiries = view !== 'inquiries' && transcript ? await loadInquiriesFor(supabase, transcript.conversation.id) : [];

  const href = (nextView: InboxView, id?: string) => `/bots/${bot.id}/inbox?view=${nextView}${id ? `&id=${id}` : ''}`;
  const hasSelection = Boolean(selectedInquiry || transcript);

  return (
    <main className="flex-1 px-6 py-8 lg:px-10">
      <h1 className="text-2xl font-bold tracking-[-0.02em]">문의</h1>
      <p className="mt-2 text-[15px] text-muted">{openCount > 0 ? `확인할 문의 ${openCount}건` : '확인할 문의가 없습니다.'}</p>

      <nav aria-label="보기" className="mt-6 flex flex-wrap gap-2">
        {INBOX_VIEWS.map((option) => (
          <Link
            key={option}
            href={href(option)}
            aria-current={view === option ? 'page' : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm ${view === option ? 'border-ink bg-ink text-white' : 'border-line text-muted hover:text-ink'}`}
          >
            {VIEW_LABELS[option]}
          </Link>
        ))}
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section aria-label={`${VIEW_LABELS[view]} 목록`}>
          {view === 'inquiries' ? (
            inquiries.length === 0 ? (
              <p className="text-[15px] leading-relaxed text-muted">
                아직 접수된 문의가 없습니다. 위젯이 답하지 못한 질문에 방문자가 문의를 남기면 여기에 쌓입니다.
              </p>
            ) : (
              <ul className="border-t border-line">
                {inquiries.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={href('inquiries', row.id)}
                      aria-current={row.id === selectedInquiry?.id ? 'true' : undefined}
                      className={`block border-b border-line px-3 py-3 ${row.id === selectedInquiry?.id ? 'bg-surface' : 'hover:bg-surface'}`}
                    >
                      <span className="line-clamp-1 text-[15px] font-semibold">{row.question}</span>
                      <span className={`mt-1 block text-sm ${row.status === 'new' ? 'text-danger' : 'text-muted'}`}>
                        {STATUS_LABELS[row.status]}, {timeAgo(row.created_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : conversations.length === 0 ? (
            <p className="text-[15px] leading-relaxed text-muted">
              {view === 'unanswered'
                ? '답하지 못한 질문이 없습니다.'
                : '아직 대화가 없습니다. 미리보기나 설치한 사이트에서 질문이 들어오면 여기에 표시됩니다.'}
            </p>
          ) : (
            <ul className="border-t border-line">
              {conversations.map((row) => (
                <li key={row.id}>
                  <Link
                    href={href(view, row.id)}
                    aria-current={row.id === transcript?.conversation.id ? 'true' : undefined}
                    className={`block border-b border-line px-3 py-3 ${row.id === transcript?.conversation.id ? 'bg-surface' : 'hover:bg-surface'}`}
                  >
                    <span className="line-clamp-1 text-[15px] font-semibold">{row.firstQuestion}</span>
                    <span className="mt-1 block text-sm text-muted">
                      {originLabel(row.origin)}, {timeAgo(row.lastAt)}
                      {row.unanswered > 0 && <span className="text-danger">, 답하지 못한 질문 {row.unanswered}개</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="상세" className="min-w-0">
          {!hasSelection && <p className="text-[15px] text-muted">목록에서 항목을 고르면 내용이 보입니다.</p>}
          {selectedInquiry && <InquiryDetail botId={bot.id} inquiry={selectedInquiry} />}
          {linkedInquiries.map((row) => (
            <InquiryDetail key={row.id} botId={bot.id} inquiry={row} />
          ))}
          {transcript && (
            <div className={selectedInquiry || linkedInquiries.length ? 'pt-6' : ''}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-bold">대화</h2>
                <p className="text-sm text-muted">
                  {originLabel(transcript.conversation.origin)}, {formatDate(transcript.conversation.created_at)}
                </p>
              </div>
              <Transcript botId={bot.id} messages={transcript.messages} />
              <DeleteConversation botId={bot.id} conversationId={transcript.conversation.id} />
            </div>
          )}
          {selectedInquiry && !transcript && (
            <p className="pt-6 text-sm text-muted">연결된 대화가 삭제되어 문의 내용만 남아 있습니다.</p>
          )}
        </section>
      </div>
    </main>
  );
}
