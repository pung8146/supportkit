# 배포

관리자·API(Vercel), DB(Supabase), 데모 쇼핑몰(Vercel 별도 프로젝트)로 나눠 배포합니다. 데모 쇼핑몰은 **관리자와 다른 도메인**이어야 외부 설치를 증명할 수 있습니다.

## 1. Supabase

1. 새 프로젝트를 만듭니다. 리전은 Seoul(ap-northeast-2)을 고릅니다.
2. 로컬에서 연결하고 마이그레이션을 적용합니다.

   ```bash
   corepack pnpm exec supabase login
   corepack pnpm exec supabase link --project-ref <project-ref>
   corepack pnpm exec supabase db push
   ```

3. Dashboard → Authentication → Sign In / Providers에서 **Allow anonymous sign-ins**를 켭니다. 공개 데모라면 같은 화면에서 CAPTCHA도 켜는 것을 권장합니다.
4. SQL Editor에서 확인합니다.

   ```sql
   select jobname, schedule from cron.job;          -- supportkit-cleanup
   select public.cleanup_expired();                 -- 권한 오류 없이 실행되는지
   ```

5. 공개 데모 봇을 만듭니다. `supabase/seed.sql`의 내용을 복사하되, 허용 도메인은 데모 쇼핑몰 주소로, 월 한도는 원하는 값으로 바꿉니다.

   ```sql
   -- seed.sql의 bots insert에서:
   --   allowed_origins → array['https://<데모몰 도메인>']
   --   monthly_limit   → 3000
   ```

## 2. Vercel: 관리자·API

| 설정 | 값 |
|---|---|
| Root Directory | `apps/admin` |
| Build Command | `pnpm --filter @supportkit/widget build && next build` |
| Function Region | Seoul (icn1), Supabase와 같은 지역 |

환경 변수 (모두 서버 전용, `NEXT_PUBLIC_*`만 공개 가능):

| 이름 | 값 |
|---|---|
| `WIDGET_TOKEN_SECRET` | 무작위 48바이트 이상 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase 프로젝트 설정 |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase 프로젝트 설정 |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | 각 콘솔 (월 지출 한도 필수) |
| `RESEND_API_KEY`, `INQUIRY_NOTIFY_EMAIL` | 선택. 없으면 문의 알림만 건너뜀 |
| `LIMIT_*` | 선택. `.env.example` 참고 |

pnpm 버전을 `packageManager`대로 쓰려면 `ENABLE_EXPERIMENTAL_COREPACK=1`도 넣습니다.

Vercel Hobby 플랜은 비상업적 개인 용도로 제한됩니다. 포트폴리오 데모는 Hobby로, 고객 납품은 Pro로 배포합니다.

## 3. Vercel: 데모 쇼핑몰

| 설정 | 값 |
|---|---|
| Root Directory | `apps/demo-shop` |
| Build Command | `node ../../scripts/build-demo-shop.mjs` |
| Output Directory | `dist` |
| 환경 변수 | `SUPPORTKIT_URL=https://<관리자 도메인>` |

## 4. 배포 후 확인

1. 데모 쇼핑몰에서 위젯을 열고 질문합니다.
2. 관리자에서 "샘플 위젯으로 체험하기" → 지식 수정 → 미리보기 답변이 바뀌는지 확인합니다.
3. 다른 도메인에 설치 코드를 붙였을 때 위젯이 뜨지 않는지 확인합니다.
4. Anthropic·OpenAI 콘솔의 지출 한도와 자동 충전 설정을 다시 확인합니다.
