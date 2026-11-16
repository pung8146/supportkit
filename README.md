# SupportKit

웹사이트에 스크립트 한 줄로 설치하는 AI 상담 위젯입니다. 운영자가 등록한 안내 안에서만 답하고, 답하지 못한 질문은 담당자에게 문의로 넘깁니다.

> 개인이 제작한 포트폴리오 프로젝트입니다. 데모 쇼핑몰 "소담공방"은 가상이며 실제 주문·결제되지 않습니다.

```html
<script src="https://<배포 주소>/widget/loader.js" data-bot="pk_..." async></script>
```

## 구성

| 경로 | 역할 |
|---|---|
| `packages/widget` | 고객 사이트에 붙는 로더(1.9KB gzip)와 iframe 위젯(React) |
| `apps/admin` | 관리자 화면과 위젯 API (Next.js 16) |
| `apps/demo-shop` | 위젯이 설치된 별도 도메인의 정적 데모 쇼핑몰 |
| `supabase` | 스키마, RLS, 검색·카운터·정리 SQL 함수 |
| `docs/planning` | 기획 문서 7종 |
| `docs/case-study.md` | 기술 결정과 측정값 |
| `docs/deploy.md` | 배포 절차 |

## 로컬 실행

Node 24, Docker, pnpm(Corepack)이 필요합니다.

```bash
corepack pnpm install
corepack pnpm exec supabase start
cp .env.example apps/admin/.env.local   # 값 채우기: corepack pnpm exec supabase status
corepack pnpm dev                       # 관리자 http://localhost:3000, 데모몰 http://localhost:5174
```

API 키 없이 둘러보려면 `apps/admin/.env.local`에 `LLM_MODE=fake`를 넣습니다. 정해진 답변과 가짜 임베딩으로 동작합니다.

## 테스트

| 명령 | 내용 | 비용 |
|---|---|---|
| `corepack pnpm test` | 단위 테스트 | 없음 |
| `corepack pnpm test:db` | RLS, 테넌트 분리, 카운터, 정리 작업 (로컬 Supabase) | 없음 |
| `corepack pnpm e2e` | Chromium·Firefox·WebKit E2E, axe 접근성, 성능 | 없음 (가짜 LLM) |
| `corepack pnpm test:eval` | 실제 Claude Haiku 5.5·임베딩으로 답변 품질·검색·지연 측정 | 1~2센트 |
