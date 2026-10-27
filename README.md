# Sunday School Manager

주일학교 운영을 위한 출석/학생/교사 관리 시스템입니다.

핵심 목적:
- 주 단위(일요일 기준) 출석 관리
- 학생/보호자 정보 관리
- 교사 정보 관리
- 학생 달란트(포인트) 증감 관리
- 이메일/비밀번호 회원가입·로그인과 관리자 승인 흐름
- 교회 이름 · 부서(유년부/청소년부/청년부 …) · 학년도별 반 · 반별 교사 배정 (관리자 [조직 관리])
- 학생 CSV 일괄 등록(없는 부서·반 자동 생성), 반별 출석 체크, 새친구 등록과 출석 횟수
- 반별/개인별 출석 통계(학년도 기준), 반 이동·부서 이동, 연말 [학년 진급] 마법사

## 주요 기능 (기획 기준)
- 회원가입 → 관리자 승인 후 서비스 접근
- 비로그인 사용자의 모든 경로 접근 시 로그인 페이지로 리다이렉트 (예외: `/guest` 이하 게스트 둘러보기 경로는 데모 데이터로 공개)
- 관리자 교사의 교사 가입 승인/거절
- 학생 관리
- 출석 및 달란트 지급 관리
- 분기별 생일 대상자/출석 요약 대시보드

## 기술 스택
- Framework: Next.js (App Router)
- Language: TypeScript
- Deployment: Vercel
- Auth: Auth.js (이메일/비밀번호, Credentials)
- Data Store: Google Drive 스프레드시트 (Apps Script 웹 앱 경유)
- Server State: TanStack Query (React Query)
- Client State: Zustand
- Styling: Tailwind CSS, SCSS
- Validation: Zod

## 데이터 모델 (Google Sheets 탭)
- `teachers`
- `students` (특이사항·새친구·첫 방문일 포함)
- `guardian_contacts` (학생 1:1 종속)
- `attendances` (출석 당시 반 id 포함)
- `talent_transactions`
- `settings` (교회 이름)
- `departments` · `classes`(학년도별 반, 담당 교사) · `enrollments`(학생-반 배정 이력)

컬럼 정의: `src/server/db/sheet-schema.ts` (각 탭 1행 헤더가 이 순서와 같아야 함)

## 저장소 준비 (최초 1회, Google Cloud 콘솔 불필요)
1. Google Drive의 원하는 폴더에서 **새로 만들기 > Google 스프레드시트**로 빈 시트를 만든다.
2. 시트 메뉴 **확장 프로그램 > Apps Script**를 열고, 기본 `Code.gs` 내용을 지운 뒤 저장소의 `apps-script/Code.gs`를 통째로 붙여 넣고 저장한다.
3. 편집기 왼쪽 **서비스 +** 를 눌러 **Google Sheets API**를 추가한다.
4. 토큰을 만든다: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   편집기 왼쪽 **프로젝트 설정(톱니) > 스크립트 속성 > 속성 추가**에 이름 `API_TOKEN`, 값에 방금 만든 토큰을 넣는다.
5. **배포 > 새 배포 > 유형: 웹 앱**, 실행 사용자 **나**, 액세스 권한이 있는 사용자 **모든 사용자**로 배포한다.
   처음 한 번 권한 승인 창이 뜨면 본인 계정으로 허용한다("확인되지 않은 앱" 경고 시 고급 > 이동).
6. 배포 후 나온 **웹 앱 URL**(`.../exec`)과 토큰을 `.env.local`과 Vercel 환경변수에 넣는다.
   - `APPS_SCRIPT_URL`: 웹 앱 URL
   - `APPS_SCRIPT_TOKEN`: 4번의 토큰
7. 탭 만들기
   - 기존 Neon 데이터를 옮길 때: `.env.local`에 `DATABASE_URL`도 넣고 `yarn sheets:migrate`
     (`backups/`에 CSV 백업을 먼저 남기고, 대상 탭이 비어 있을 때만 이전함)
   - 빈 상태로 시작할 때: `yarn sheets:init`
8. 로그인 설정: `.env.local`과 Vercel에 `AUTH_SECRET`(`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)과 `NEXTAUTH_URL`(로컬은 `http://localhost:3000`)을 넣는다.
9. 첫 관리자 만들기: 사이트에서 **회원가입** 후 `yarn sheets:make-admin 가입한이메일` 실행 → 다시 로그인하면 관리자 메뉴(가입 관리)가 보인다. 이후 교사 승인은 가입 관리 화면에서 한다.

> 스키마에 컬럼이 추가되면(예: `teachers.passwordHash`) `yarn sheets:init`을 다시 실행하면 기존 헤더 뒤에 새 컬럼이 붙는다.

> `Code.gs`를 수정했다면 **배포 > 배포 관리 > 수정(연필) > 버전: 새 버전 > 배포**로 다시 배포해야 반영된다(URL은 그대로).

## 처음 운영을 시작할 때 (관리자)
1. **조직 관리**에서 교회 이름을 넣고, 부서(예: 유년부·청소년부)와 이번 학년도의 반을 만든 뒤 담당 교사를 지정한다.
2. **학생 관리 > CSV 일괄 등록**에서 템플릿을 내려받아 학생을 채워 올린다. `부서`·`반` 열을 채우면 바로 배정되고, 없는 부서·반은 자동으로 만들어진다.
3. 교사는 **출석 관리**에서 자기 반(★ 표시)의 출석을 체크하고, 새친구가 오면 [새친구] 패널에서 바로 등록한다.
4. **출석 통계**에서 반별·개인별 출석률을 본다.
5. 매년 2월 말 **조직 관리 > 학년 진급**에서 새 학년도 반 구조를 복사하고 매핑을 확인한 뒤 실행한다. 3월 1일부터 앱이 새 학년도를 기준으로 삼는다.

자세한 설계는 `docs/upgrade_plan.md`, 저장소 교체(더 빠른 DB) 검토는 `docs/db_upgrade.md`를 참고한다.

## 실행 방법
```bash
yarn install
yarn dev
```

브라우저에서 `http://localhost:3000` 접속.

## 문서
- 기획서(PRD): `docs/PRD.md`
