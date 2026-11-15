# Technical Architecture

## 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 관리자 + API | Next.js, TypeScript, Tailwind | 화면과 스트리밍 API를 한 번에 배포 |
| 위젯 | Vite로 별도 빌드한 React + 일반 CSS | 관리자 의존성과 분리, 번들 예산 관리 |
| 로더 | 의존성 없는 TypeScript | 고객 사이트 부담 최소화 |
| DB·인증 | Supabase (Postgres, RLS, pgvector, Auth) | 벡터 검색과 권한을 한 서비스로 해결 |
| 요청 제한 | Postgres 원자적 카운터 | 별도 서비스 불필요, 트래픽이 커지면 Redis로 교체 |
| 답변 LLM | Claude Haiku 5.5, 평가 미달 시 Sonnet 5.5 | 비용, 한국어 품질은 평가셋으로 확정 |
| 임베딩 | `text-embedding-3-small` | 비용이 사실상 무시할 수준 |
| 데모몰 | 프레임워크 없는 정적 HTML | React 없는 사이트 지원의 증명 |

## 구조

```text
고객 사이트                     SupportKit (단일 origin)
┌───────────────────┐           ┌──────────────────────────┐
│ loader.js         │─bootstrap→│ Origin 검증, 설정·토큰   │
│ 발사 버튼(Shadow) │           │                          │
│ iframe ───────────┼──────────→│ /embed/:key              │
│   위젯 앱         │─SSE chat─→│ 검색 → 게이트 → LLM → 검증│
└───────────────────┘           └───────┬──────────────────┘
                                 Postgres · LLM API (서버 전용)
관리자 앱 ──RLS 세션──→ 같은 Postgres
별도 도메인 데모몰 ──script 한 줄──→ loader.js
```

## 임베드

| 방식 | CSS 격리 | JS 격리 | 비고 |
|---|---|---|---|
| iframe | 완전 | 완전 | 크기 조절과 포커스 복귀에 postMessage 필요 |
| Web Component | 대부분, 상속 속성은 유입 | 없음 | 고객 페이지 스크립트와 같은 컨텍스트 |
| 직접 번들 | 없음 | 없음 | 충돌 위험이 가장 큼 |

결정: 발사 버튼은 로더의 Shadow DOM에, 채팅 패널은 지연 로드 iframe에 둔다.

순서:

1. 로더가 `POST /api/widget/bootstrap/:publicKey`를 호출한다. 이 요청의 `Origin`은 브라우저가 붙인 고객 사이트 값이므로 서버가 허용 목록과 대조한다. 커스텀 헤더와 본문이 없어 preflight가 생기지 않는다.
2. 서버가 공개 설정과 15분 수명의 서명 토큰(봇·Origin·세션)을 반환한다.
3. 로더가 iframe을 만들고 대상 origin을 명시한 postMessage로 토큰을 전달한다.
4. iframe 응답에는 봇별 `Content-Security-Policy: frame-ancestors`를 붙인다.
5. 채팅 API는 iframe과 같은 origin이므로 CORS가 필요 없다. 매 요청마다 토큰과 현재 허용 목록을 다시 확인한다.

iframe 안의 API 호출은 `Origin`이 SupportKit 자신이 된다. 그래서 Origin 검증은 반드시 로더 단계에서 한다.

## 스트리밍

`fetch`와 `ReadableStream`으로 SSE 형식을 읽는다. 이벤트: `meta`, `delta`, `sources`, `replace`, `done`, `error`. 렌더링은 `requestAnimationFrame` 단위로 묶고, `aria-live` 공지는 문장 단위로 한다.

## 검색과 환각 방지

- FAQ 1개가 1청크, 텍스트는 제목·문단 기준 약 500토큰.
- `bot_id`로 거른 뒤 정확 코사인 검색. 봇당 수백 청크면 ANN 인덱스는 불필요.
- 키워드 혼합은 평가셋에서 누락이 확인되면 P1로 추가.

| 방어 단계 | 동작 |
|---|---|
| 검색 게이트 | 유사도가 기준 미만이면 LLM을 호출하지 않고 안내 문구와 문의 폼 표시 |
| 프롬프트 | 제공된 근거로만 답하고 청크 ID를 인용, 지식베이스 내용은 데이터로 취급 |
| 결정적 검증 | 답변의 숫자·금액·기간이 인용 청크에 없으면 `replace` 이벤트로 답변 교체 |
| 도구 없음 | LLM에 도구를 주지 않아 프롬프트 주입의 피해를 텍스트로 한정 |
| 출력 정화 | HTML 비허용, 링크는 지식베이스에 있는 것만 |

## 데이터 모델

```text
bots(id, owner_id, name, public_key, theme, welcome, starters,
     allowed_origins, fallback, retention_days, monthly_limit,
     is_demo, expires_at, last_seen_origin, last_seen_at)
knowledge_items(id, bot_id, kind, title, body, version, status)
chunks(id, item_id, bot_id, version, content, embedding)
conversations(id, bot_id, visitor_hash, origin, last_at, expires_at)
messages(id, conversation_id, bot_id, role, content,
         outcome, sources_snapshot, usage)
inquiries(id, bot_id, conversation_id, question, contact,
          consent_version, consented_at, status, memo, expires_at)
rate_buckets(key, window_start, count)
```

`outcome`은 `answered | no_match | verify_failed | error`. `sources_snapshot`은 지식이 나중에 수정돼도 당시 근거를 보존한다. 지식을 수정하면 버전이 올라가고, 새 버전이 임베딩되기 전까지 이전 청크는 검색에서 제외한다. 수정 전 정책으로 답하는 것보다 답하지 않는 편이 안전하기 때문이다.

관리자 경로는 RLS를 사용한다. 공개 경로는 service role을 쓰되 `bot_id`는 항상 검증된 토큰에서만 가져오고 단일 헬퍼로 강제한다.

## 저장·보존·삭제

| 데이터 | 기본 정책 |
|---|---|
| 대화 | 90일 (30/90/180 선택), 일일 작업으로 삭제 |
| 문의 연락처 | 처리 완료 후 90일 |
| 데모 작업공간 | 24시간 |
| 방문자 IP | 원문 저장 없이 일별 솔트 해시 |
| 전화번호·이메일 등 | LLM 전송과 저장 전에 패턴 마스킹 |

문의 폼의 연락처는 LLM으로 보내지 않는다. 해외 LLM 사용은 국외 이전·처리 위탁 고지 대상이 될 수 있어 실고객 적용 전 법률 검토가 필요하다.

## 키와 남용 방지

`pk_…` 공개 식별자는 어떤 봇인지 가리킬 뿐 인증 수단이 아니다. LLM 키, service role, 토큰 서명 키는 서버 환경변수에만 둔다. 위젯 테마는 서버 값만 사용한다.

`Origin`은 비브라우저 클라이언트가 위조할 수 있다. 도메인 검증은 무단 삽입을 막는 장치이고, 비용 보호는 요청 제한이 담당한다.

| 계층 | 데모 기준값 (초안) |
|---|---|
| 입력 | 500자, 이력 6턴, 출력 400토큰 |
| 세션 | 10회 |
| IP | 일 20회 |
| 봇 | 일 100회 |
| 전역 | 일 200회, 월 예산 초과 시 답변 생성 중단 |
| 제공사 | 콘솔 지출 한도를 최종 안전장치로 설정 |

한도에 도달하면 위젯은 오류 대신 소진 안내와 미리 준비한 예시 대화를 보여준다.

관리자 데모는 Supabase 익명 로그인으로 방문자마다 샘플 복제본을 만들고 24시간 뒤 삭제한다.

## 비용 추정

답변 1회를 입력 2,500토큰, 출력 250토큰으로 가정한다.

| 모델 | 입력/출력 ($/1M) | 1,000답변 | 월 6,000답변 |
|---|---|---|---|
| Claude Haiku 5.5 | 0.10 / 0.50 | $0.38 | $2.25 |
| GPT-5 mini | 0.25 / 2.00 | $1.13 | $6.75 |
| Claude Sonnet 5.5 | 2.00 / 10.00 | $7.50 | $45 |
| Claude Opus 5.5 | 4.00 / 20.00 | $15.00 | $90 |

Haiku 5.5는 thinking이 기본 활성이고 출력으로 과금되므로 끄는 설정이 전제다. 가격은 2026-11 기준 공식 페이지로 재확인할 것.

| 운영 단계 | 월 비용 |
|---|---|
| 포트폴리오 데모 | LLM 상한 약 $2~7 + 도메인 |
| 실고객 운영 | Vercel Pro $20 + Supabase Pro $25 + LLM 사용량 |

Vercel Hobby는 비상업·개인 용도 제한, Supabase Free는 1주일 비활성 시 정지.

## 개발·배포

pnpm workspace: `apps/admin`, `apps/demo-shop`, `packages/widget`. 로컬은 Supabase CLI와 가짜 LLM 스트림을 사용하고, 서로 다른 포트로 교차 origin을 재현한다. 함수와 DB는 같은 리전에 둔다.
