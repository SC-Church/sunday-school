# Sunday School Manager

주일학교(송촌장로교회) 출석/학생/교사 관리 시스템. 무료/저비용 운영이 최우선 제약인 **소규모 내부 서비스**입니다(교사만 사용, 관리자 교사가 가입 승인).

기획 배경과 상세 정책은 아래 문서를 참고하되, 실제 코드 작업 시 지켜야 할 규칙은 이 파일에 직접 정리되어 있습니다.
- `docs/PRD.md` — 기능 요구사항
- `docs/PROJECT_POLICY.md` — 운영 정책
- `docs/AI_SESSION_SCRIPT.md` — (레거시) 이전 세션 협업 규칙, 이 파일과 충돌 시 이 파일이 우선

## 작업 원칙 (반드시 지킬 것)

- 사용자를 `형님`으로 호칭한다.
- **모든 설명·보고·질문은 한글로 작성한다** (코드와 식별자는 예외).
- **추측으로 답하지 않는다.** 프레임워크·라이브러리 동작이나 API 스펙이 확실하지 않으면 웹 검색으로 **공식 문서 또는 해당 프로젝트의 `llms.txt`**를 직접 읽고 확인한 뒤 답한다. 특히 Next.js 16, next-auth v4, Google Apps Script/Sheets API, Tailwind v4처럼 버전별 동작 차이가 큰 영역은 반드시 확인 후 답변한다.
- **완료 보고 전에 자체 검토를 반복한다.** 작업을 마쳤다고 말하기 전에 코드 리뷰와 검증(린트·타입체크·테스트·동작 확인)을 수행하고, 문제가 발견되면 수정 후 다시 검토한다. 문제가 없음을 확인한 뒤에만 "완료"라고 보고한다.

## 도메인 용어

- **달란트(Talent)**: 학생 포인트. `currentTalent`(누적, 캐시값)와 `TalentTransaction`(증감 로그)으로 관리. 증감 사유는 `ATTENDANCE`(출석 연동)와 `MANUAL_ADJUST`(수동 조정) 두 가지로 구분.
- **출석(Attendance)**: 일요일 단위(주 1회)로만 관리. 상태는 `PRESENT`/`ABSENT` 2가지뿐.
- **교사 승인 상태(TeacherApprovalStatus)**: `PENDING`(가입 대기) → `APPROVED`(승인, 서비스 이용 가능) / `REJECTED`(거절).
- **교사 권한(TeacherRole)**: `ADMIN`(가입 승인, 달란트 초기화 등 관리 기능) / `TEACHER`(일반).
- **보호자(GuardianContact)**: 학생 1명당 1개만 존재(1:1).
- **부서(Department) / 반(Class) / 배정(Enrollment)** (2026-09 추가): 부서(유년부·청소년부·청년부 등) 아래 **학년도별** 반이 있고, 학생은 학년도당 ACTIVE 배정 1개로 반에 속한다. 반 이동·진급은 기존 배정을 `ENDED`로 닫고 새 배정을 만든다(이력 보존). 출석·달란트는 `studentId`로 이어지므로 반이 바뀌어도 그대로 따라간다. 반에 속하지 않은 학생은 "미배정"이다.
- **학년도(schoolYear)**: 3월 시작. `getSchoolYearInKst()` 한 곳에서 계산한다. 반은 학년도마다 따로 존재하고, 진급은 [학년 진급] 화면에서 이전 학년도 반 → 새 학년도 반 매핑으로 실행한다(`src/lib/promotion.ts`가 매핑을 제안).
- **새친구(isNewFriend)**: 첫 방문일(`firstVisitDate`) 이후 출석 횟수를 출석 화면의 [새친구] 패널에 보여주고, 정착 처리하면 일반 학생이 된다.
- **특이사항(note)**: 교사에게만 보이는 메모. 게스트 화면에는 넘기지 않는다.
- **교회 이름**: `settings` 탭 `church_name`. 관리자가 [조직 관리]에서 바꾸며 헤더·로그인 화면에 표시된다.
- **출석 범위(ClassScope)**: 출석/학생/통계 화면은 `class_id` 쿼리로 반 하나·`unassigned`·`all`을 고른다(`src/lib/attendance-display.ts`). 출석 화면 기본값은 로그인 교사의 담당 반이다.
- **학년(grade)**: 생년월일과 학사연도(3월 시작) 기준으로 계산하는 **참고 라벨**(`졸업생`/`6학년`~`1학년`/`유아부`). 실제 소속은 반 배정이 결정하며, 이 라벨은 화면에 "학년(참고)"로만 보인다. 계산 로직과 `StudentGradeLabel` 타입은 **`src/utils/grade.ts` 한 곳에서만** 정의한다 — 중복 구현 금지(과거 계산 불일치 버그 이력 있음). 학생 관리의 "졸업생 패널"은 2026-09 반 구조 도입으로 없어졌다(청년부 등 초등 기준이 맞지 않는 부서가 생겼기 때문).

## 기술 스택

Next.js(App Router, v16) · TypeScript · Auth.js(next-auth v4, 이메일/비밀번호) · Google Sheets + Apps Script · TanStack Query · Zustand · Tailwind CSS + SCSS · Zod · Vercel 배포.

패키지 매니저는 `yarn`만 사용한다.

## 렌더링 방식

이 프로젝트는 **ISR/SSG를 쓰지 않는다.** 모든 페이지가 로그인 세션(`getServerSession`)과 서버 데이터를 페이지 진입 시점에 직접 조회하는 완전 동적 SSR이다 — 개인화된 인증 기반 데이터라 정적/재검증 캐싱이 맞지 않기 때문. 새 페이지를 추가할 때도 `revalidate`/`generateStaticParams`를 임의로 넣지 않는다.

인증/권한 가드는 `src/proxy.ts`(Next.js 16의 middleware, 파일명이 `proxy.ts`로 변경됨)에서 전 라우트에 적용된다.

## 아키텍처 원칙

- 기본 데이터 조회는 **Server Component에서 저장소 함수(`src/server/db/repository.ts`)를 직접 호출**한다. 권한 체크는 반드시 서버에서 최종 판정(클라이언트 신뢰 금지).
- **사용자가 클릭해서 즉시 반응해야 하는 모든 요소(버튼, 폼 제출, 삭제/수정 액션)는 클라이언트 컴포넌트 + API route(fetch) 또는 React Query로 구현한다.** 실제 배포 후 Server Action의 폼 검증 실패 리다이렉트나 "수정" 버튼의 전체 페이지 라우팅 방식이 체감상 느려서 사용성 문제가 있었음이 확인됨 — 새 CRUD 화면은 `AttendanceInteractiveSection.tsx` 패턴(클라이언트 컴포넌트 + API route + React Query, 낙관적 업데이트)을 기본으로 따른다. Server Action은 리다이렉트 없이 끝나는 단순 케이스(예: 캐시 무효화 후 같은 페이지 새로고침)에만 남겨둔다.
- 전역 상태(Zustand)는 여러 페이지/컴포넌트가 동시에 참조하는 경우에만 사용. 서버 데이터 캐시는 React Query, UI 임시 상태(모달/토스트 등)는 로컬 상태나 Context로 우선 검토.
- 외부 클라이언트와 공유되는 인터페이스는 `route.ts`로 분리.
- 에러 바운더리는 Next.js 기본 제공 파일 컨벤션(`error.tsx`)을 우선 사용한다. `react-error-boundary` 같은 별도 패키지는 라우트 세그먼트 단위가 아닌 더 세밀한(단일 위젯 단위) 격리가 꼭 필요할 때만 검토.

## 코드 컨벤션

- 함수/메서드 선언부에 **한글 JSDoc** 작성.
- 이벤트 핸들러는 `handle...` 접두어 (`handleClick`, `handleSubmit`).
- `src/app` 하위 폴더명은 `kebab-case`.
- 쿼리스트링 키는 `snake_case` (예: `callback_url`).
- 모든 `next/link`는 `prefetch={false}` 강제(내부/외부 구분 없이).
- 색상은 `src/app/globals.css`의 전역 변수(`--color-*`)만 사용. 공통 버튼은 `src/lib/button.ts`의 `getButtonClassName()` 재사용(`btn-*` 클래스 체계).
- Import 정렬: `.vscode/settings.json`의 `source.organizeImports: false` 유지, `source.fixAll.eslint: true`로 처리.

## 인증/권한

- **이메일 + 비밀번호 로그인**(next-auth v4 Credentials, JWT 세션). Google 로그인은 쓰지 않는다(2026-09 전환). 토큰 유지 기간은 `src/lib/auth.ts`의 `DEFAULT_TOKEN_MAX_AGE_SECONDS` 참고.
- 회원가입(`/signup`, `POST /api/signup`)으로 만든 계정은 항상 `TEACHER` + `PENDING`으로 시작하고, 관리자가 `/signup-management`에서 승인한다.
- **가입 시 이메일 소유를 확인하지 않는다.** 그래서 이메일만 보고 관리자로 자동 지정하거나(예전 `ADMIN_EMAILS` 방식) 기존 계정에 비밀번호를 새로 거는 동작을 넣지 않는다. 첫 관리자는 시트 접근 권한이 있는 사람이 `yarn sheets:make-admin <이메일>`로 지정한다. 비밀번호가 없는 계정(Neon에서 옮긴 계정 등)은 관리자의 "비밀번호 초기화"로만 비밀번호를 받는다.
- 비밀번호는 `src/lib/password.ts`(Node 내장 scrypt, salt 포함)로 해시해 `teachers.passwordHash`에만 저장한다. 평문·임시 비밀번호는 저장하거나 로그로 남기지 않는다. 규칙(영문+숫자 8~64자)은 `src/lib/validation/auth.ts` 한 곳에서 정의한다.
- 로그인 5회 실패 시 10분 잠금(`src/lib/login-throttle.ts`, 인스턴스별 메모리). 관리자가 비밀번호를 초기화하면 해당 계정 잠금을 푼다.
- 비밀번호 분실: 관리자가 가입 관리에서 임시 비밀번호 발급(한 번만 표시) → 교사가 로그인 후 [교사 정보 > 수정]에서 변경(`POST /api/teachers/[teacher_id]/password`, 본인만, 현재 비밀번호 확인).
- 삭제된 계정의 세션은 다음 동기화(최대 5분) 때 승인 정보가 지워져 보호된 화면에 들어오지 못한다.
- 미로그인 시 `/login`으로 리다이렉트. 승인 상태에 따라 `/pending`, `/rejected`로 분기. 공개 경로는 `/`, `/login`, `/signup`, `/api/signup`, `/guest/**`뿐이다(`src/proxy.ts`).
- **예외: `/guest` 이하 경로는 로그인·승인 상태와 무관하게 공개다.** 데모 데이터(`src/server/guest/demo-data.ts`)만 렌더링하며 **저장소(Google Sheets)를 조회하지 않는다.** 게스트 화면에 실제 학생·교사 정보나 외부 링크(회의록·재정 관리 등)를 넣지 않는다 — 새 게스트 화면을 추가할 때 이 원칙을 먼저 확인할 것. 쓰기 버튼도 노출하지 않는다(API는 승인 세션만 통과하므로 호출해도 403이지만, 눌리는 버튼 자체를 두지 않는다).
- 게스트 화면이 전부 완성되기 전까지 로그인 페이지에 진입점을 노출하지 않는다(현재는 URL로만 접근). 진행 상황은 `docs/FEATURE_PLAN.md` 참고.
- 관리자 전용 페이지(`/signup-management` 등)는 `ADMIN`만 접근.

## 데이터 저장소 (Google Sheets + Apps Script)

DB(Neon Postgres + Prisma) 대신 **Google Drive의 스프레드시트 1개**를 저장소로 쓴다(2026-09 전환). 탭 9개: `teachers`, `students`, `guardian_contacts`, `attendances`, `talent_transactions`, `settings`, `departments`, `classes`, `enrollments`. 컬럼 정의는 `src/server/db/sheet-schema.ts`, 설계 배경은 `docs/upgrade_plan.md`, 저장소 교체 검토는 `docs/db_upgrade.md`.

- **Google Cloud 콘솔을 쓰지 않는다.** 스프레드시트에 붙인 Apps Script(`apps-script/Code.gs`)를 웹 앱(실행: 나, 액세스: 모든 사용자)으로 배포하고, 앱은 그 URL로 요청한다. 스크립트는 시트 소유자 권한으로 실행된다. 환경변수: `APPS_SCRIPT_URL`(`/exec`로 끝남), `APPS_SCRIPT_TOKEN`(스크립트 속성 `API_TOKEN`과 같은 값, 없으면 모든 요청 거부).
- `Code.gs`를 고치면 저장소 파일과 스프레드시트의 스크립트를 함께 바꾸고, **[배포 관리 > 수정 > 새 버전]으로 재배포**해야 반영된다(URL 유지).
- 코드 구조: `src/server/db/sheets-client.ts`(Apps Script 호출), `sheet-schema.ts`(탭/컬럼 정의, 셀↔레코드 변환), `sheet-requests.ts`(batchUpdate 요청 생성), `dataset.ts`(전체 읽기 + 인스턴스 캐시), `repository.ts`(도메인 읽기/쓰기). **앱 코드는 `repository.ts`만 호출한다.** 조회는 `getStoreSnapshot()`(캐시) 하나로 전체 데이터를 받아 서비스 계층에서 계산한다.
- **조회 캐시**: 읽기 1회가 실측 2.4~4.9초라 `dataset.ts`가 전체 탭을 한 번에 읽어 **20초** 캐시한다(`DATASET_CACHE_TTL_MS`). 쓰기는 항상 새로 읽고(revision 충돌 검사), 반영 후 캐시를 비운 뒤 `after()`로 응답 후 다시 읽어 둔다(`warmup.ts`). 로그인 검증(`findTeacherByEmailFresh`)만 캐시를 건너뛴다. 따라서 **시트를 손으로 고치거나 스크립트로 쓴 내용은 최대 20초 뒤에 화면에 보인다.** Vercel 인스턴스가 여러 개면 인스턴스마다 캐시가 따로 있다.
- 컬럼 정의는 `sheet-schema.ts` 한 곳에만 둔다. 각 탭의 1행 헤더는 스키마 순서와 같아야 하며, 다르면 오류로 멈춘다(스키마 뒤에 붙인 추가 컬럼은 허용).
- 읽기는 필요한 탭을 호출 1회로 읽고, 쓰기 작업 하나는 호출 1회(Sheets API `batchUpdate`, 원자적)로 반영한다. 호출 하나가 1~2초 걸리므로 새 기능도 "작업당 호출 최소화"를 지킨다.
- **동시성**: 쓰기는 `repository.ts`의 `runWrite`로만 한다. 스크립트가 잠금(LockService) 안에서 revision을 확인해, 읽은 뒤 다른 쓰기가 끼어들었으면 거절하고 앱이 다시 읽어 재시도한다. 쓰기 호출은 네트워크 오류 시 자동 재시도하지 않는다(이미 반영됐을 수 있어 중복 방지).
- 날짜는 `+09:00`이 붙은 ISO 문자열로, 문자열 값은 `stringValue`로 저장해 시트가 날짜·수식으로 바꾸지 못하게 한다. 시트를 사람이 직접 고칠 때 날짜 셀 형식이나 `id` 컬럼을 건드리지 않고, 가능하면 앱을 쓰지 않는 시간에 고친다(직접 수정은 revision 확인 대상이 아님).
- 스키마를 바꾸면(컬럼 추가 등) `sheet-schema.ts`의 **컬럼 목록 끝에** 추가하고 `yarn sheets:init`을 실행한다 — 새 탭을 만들고 기존 헤더 뒤에 새 컬럼 이름을 붙여 준다(중간 삽입·순서 변경은 지원하지 않는다). 나중에 추가된 불리언 컬럼은 `optionalBoolean`(빈 셀 = false)을 쓴다.
- 초기 이전: `yarn sheets:migrate`(Neon → CSV 백업 `backups/` → 시트). `backups/`는 개인정보가 담겨 있어 git에서 제외한다.

## 날짜/시간

모든 날짜·시간 계산은 **한국시간(Asia/Seoul, +09:00) 기준**. 관련 유틸은 `src/utils/date.ts`에 집중되어 있으며 신규 계산 로직도 여기에 추가하고 재사용한다.

## 테스트 정책

- **Vitest 단위 테스트**를 사용한다(`yarn test`). 설정은 `vitest.config.ts`, 테스트 파일은 대상 파일 옆에 `*.test.ts`로 둔다.
- 테스트 대상은 **DB 없이 검증 가능한 순수 로직과 가드**로 한정한다: 날짜/학년 계산(`src/utils/`), 정렬(`src/lib/student-sort.ts`), 입력 검증(`src/lib/validation/`), 비밀번호 해시·로그인 잠금(`src/lib/password.ts`, `src/lib/login-throttle.ts`), 시트 변환/요청 생성(`src/server/db/`), 세션 가드(`src/lib/api-session.ts`), 라우트 가드(`src/proxy.ts`).
- 운영 시트가 실데이터라 수동 테스트가 어렵다. **권한 판정과 입력 검증을 바꿀 때는 반드시 테스트를 먼저/함께 갱신한다.**
- Apps Script 호출 자체를 모킹해 CRUD를 테스트하지는 않는다(모킹 비용 대비 가치 낮음). 대신 시트 셀 변환(`src/server/db/sheet-schema.ts`)과 쓰기 요청 생성(`src/server/db/sheet-requests.ts`)은 순수 함수로 두고 단위 테스트한다. 브라우저 e2e(Playwright)도 도입하지 않는다 — CI가 없고 운영 데이터가 실데이터이기 때문.
- 순수 로직으로 분리해 테스트하는 것들: 출석 통계(`src/server/attendance/stats.ts`), CSV 파싱(`src/lib/csv.ts`), CSV 행 검증(`src/lib/validation/student-import.ts`), 진급 매핑 제안(`src/lib/promotion.ts`), 조직 입력 검증(`src/lib/validation/organization.ts`).
- 전체 흐름(가입→승인→반 생성→CSV 등록→출석→진급)은 가짜 Apps Script 서버(`Code.gs`를 vm으로 실행하는 로컬 HTTP 서버)에 dev 서버를 붙여 curl로 확인한다. 실제 시트를 건드리지 않고 검증할 수 있다.
- 트리비얼한 한 줄짜리 함수/컴포넌트에는 테스트를 강제하지 않는다.

## 필수 검증 절차 (배포 전)

```
yarn lint
yarn prettier --check "src/**/*.{ts,tsx,scss}" "src/proxy.ts"
yarn tsc --noEmit
yarn test
```

> 빌드 확인은 `yarn build:local`(= `.env.local`을 읽어 `next build`)을 사용한다. 빌드는 시트 데이터를 건드리지 않는다.

## 인코딩 안전 원칙

- 모든 소스 파일은 UTF-8. 대량 치환/터미널 출력 붙여넣기로 파일을 덮어쓰지 않는다(과거 한글 깨짐 사고 이력 있음).
- 파일 수정은 Edit 도구(patch 기반)를 우선 사용, 셸로 직접 파일을 쓸 경우 인코딩을 명시.
- 작업 후 깨진 문자(`?숇`, `湲덉` 등) 의심 시 즉시 확인하고 린트/타입체크 재실행.
- `src/server/attendance/service.ts`는 2026-09에 일반 UTF-8(BOM 없음, 한글 그대로)로 다시 작성했다. 예전의 "한글이 유니코드 이스케이프로 저장되는" 특성은 더 이상 없다. `src/proxy.ts`, `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/components/layout/AppShell.tsx`, `src/lib/menu-items.ts` 등 일부 파일은 UTF-8 BOM이 붙어 있으므로 셸로 다시 쓸 때 BOM을 보존한다.

## 변경 관리

- 인증/권한/날짜 계산/출석·달란트 로직처럼 운영에 영향이 큰 변경은 커밋 메시지에 변경 이유를 명시한다.
- 정책이 실제로 바뀌면(예: 이번 아키텍처 원칙 갱신처럼) 이 문서와 `docs/PROJECT_POLICY.md`를 함께 갱신한다.
