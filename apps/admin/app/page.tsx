import { redirect } from 'next/navigation';
import { currentUserId } from '../lib/admin/session';
import { createUserClient } from '../lib/supabase/server';
import { notExpired } from '../lib/widget/bots';
import { DemoButton } from './demo-button';

export default async function Home() {
  if (await currentUserId()) {
    const supabase = await createUserClient();
    const { data } = await supabase.from('bots').select('id').or(notExpired()).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (data) redirect(`/bots/${data.id}/inbox`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      <p className="mb-10 text-[15px] font-semibold">SupportKit</p>
      <h1 className="text-[clamp(2.25rem,6vw,3.5rem)] leading-[1.15] font-bold tracking-[-0.03em]">
        등록한 안내로만 답하는
        <br />
        웹사이트 상담 위젯
      </h1>
      <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted">
        자주 묻는 질문을 등록하고 스크립트 한 줄을 붙이면, 방문자 질문에 AI가 답합니다. 안내에 없는 질문은 지어내지 않고
        담당자에게 문의로 넘깁니다.
      </p>
      <div className="mt-10">
        <DemoButton />
        <p className="mt-4 text-sm text-muted">가입 없이 샘플 쇼핑몰의 상담 위젯을 직접 고쳐 볼 수 있습니다.</p>
      </div>
    </main>
  );
}
