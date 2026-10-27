# 데이터 저장소 업그레이드 검토 — Google Drive(시트)보다 편하고 빠른 방법

작성일 2026-09-27. 현재 저장소는 Google 스프레드시트 1개(Apps Script 웹 앱 경유)다.
이 문서는 "왜 느린지", "어떤 대안이 있는지", "무엇을 추천하는지", "바꾸면 어디를 고쳐야 하는지"를 정리한다.
요금·리전·한도는 2026-09-27에 각 서비스 공식 문서에서 확인한 값이며, 바뀔 수 있으니 결정 전에 다시 확인한다.

## 1. 지금 구조의 한계 (실측)

| 항목 | 현재(Google 시트 + Apps Script) |
|---|---|
| 읽기 1회 | **2.4 ~ 4.9초** (2026-09-27 실측, 9개 탭 기준으로도 비슷) |
| 쓰기 1회 | 2 ~ 3초 (스크립트 잠금 + Sheets API batchUpdate) |
| 동시 쓰기 | 스크립트 잠금으로 직렬화. 30개 동시 실행 제한, 실행당 6분 제한(Apps Script 할당량) |
| 데이터 관리 UI | 스프레드시트 그 자체(편하지만, 헤더·날짜 서식을 잘못 건드리면 앱이 멈춤) |
| 백업 | Drive 버전 기록 |
| 비용 | 무료 |

이번 업그레이드에서 **20초 서버 캐시**(`src/server/db/dataset.ts`)를 넣어 화면 전환은 대부분 즉시 응답하지만, **저장 1회 2~3초**와 **캐시가 식은 뒤 첫 화면 2~5초**는 구조상 없앨 수 없다.
학생 200명 × 주 52회 출석이면 1년에 약 1만 행이 쌓이는데, 시트를 통째로 읽는 방식이라 해가 갈수록 느려진다.

## 2. 대안 비교

"편리한 관리"는 **표(스프레드시트)처럼 데이터를 보고 고칠 수 있는 관리 화면**이 있는지, "빠름"은 한국(서울 Vercel 리전)에서의 왕복 지연으로 봤다.

| 후보 | 종류 | 무료 한도 (공식 문서) | 한국에서 지연 | 표 형태 관리 UI | CSV 가져오기/내보내기 | 비고 |
|---|---|---|---|---|---|---|
| **Supabase** (추천) | Postgres 호스팅 | 활성 프로젝트 2개, DB 500MB, 전송 5GB/월. **1주일 미사용 시 프로젝트 일시정지**(대시보드에서 재개) | **서울 리전(ap-northeast-2)** 있음 → 수십 ms | 대시보드 Table Editor가 스프레드시트처럼 셀 편집·정렬·필터 가능 | 대시보드에서 CSV 가져오기(100MB 한도)·내보내기 지원 | Pro $25/월부터. 유료 전환 없이도 충분 |
| Neon (이전에 쓰던 것) | Postgres 서버리스 | 프로젝트 100개, 프로젝트당 저장 0.5GB, 컴퓨트 100 CU-시간/월, **5분 미사용 시 자동 정지**(첫 쿼리 콜드스타트) | 서울·도쿄 리전 없음, **싱가포르**가 가장 가까움 → 약 70~100ms + 콜드스타트 | 콘솔에 테이블 보기/편집 있음(Table Editor보다 단순) | psql `\copy`로 가능, 콘솔 CSV 가져오기는 제한적 | Prisma 스키마·마이그레이션이 git 이력에 남아 있어 되돌리기 쉬움 |
| Turso | SQLite(libSQL) 호스팅 | DB 100개, 저장 5GB, 월 읽기 5억 행·쓰기 1천만 행 | 도쿄 등 아시아 리전 → 30~50ms | 웹 콘솔은 SQL 위주, 표 편집은 약함 | CLI로 가능 | Developer $4.99/월. 가볍고 빠르지만 관리 UI가 약함 |
| Airtable / Baserow | 스프레드시트형 DB | Airtable 무료 1,000행/베이스 등 **행 수 제한이 작음** | 해외 → 100ms+ | 최고 수준 | 좋음 | 출석 행이 연 1만 건이라 무료 한도를 바로 넘김. 제외 |
| Firebase Firestore | 문서형 DB | 넉넉함(1GB, 읽기 5만/일) | 서울 리전 있음 | 콘솔에서 문서 편집(표 아님) | 없음(코드로) | 관계형 계산(출석 통계)을 문서형으로 다시 짜야 하고, Google Cloud 프로젝트가 생성됨. 제외 |
| 현재 유지 (시트) | — | 무료 | 2~5초 | 스프레드시트 | 그 자체 | 위 1절 한계 |

## 3. 추천: Supabase (서울 리전) + Table Editor

**이유**
1. **관리가 편하다.** Table Editor가 시트와 비슷하게 생겨서 관리자가 학생·반·출석을 눈으로 보고 고칠 수 있고, CSV 가져오기/내보내기도 대시보드에서 된다. 시트처럼 헤더를 잘못 건드려 앱이 멈추는 일은 없다(컬럼 타입이 DB에 고정됨).
2. **빠르다.** 서울 리전이라 쿼리 1회 수십 ms. 저장 버튼이 눌리는 즉시 반영되고, 캐시 없이도 화면 전환이 빠르다.
3. **무료로 충분하다.** 주일학교 규모(수백 명, 연 수만 행)는 500MB의 1% 미만이다.
4. **트랜잭션·동시성**이 DB에 있어, 지금처럼 revision 검사·재시도를 앱이 흉내 낼 필요가 없다.
5. Postgres라서 예전 Prisma 스키마(git 이력)를 거의 그대로 살릴 수 있고, 나중에 Neon 등 다른 Postgres로 옮기기도 쉽다.

**주의할 점**
- **무료 프로젝트는 1주일 미사용 시 일시정지**된다. 주일마다 쓰면 정지되지 않지만, 방학 등으로 2주 이상 쓰지 않으면 대시보드에서 "Restore"를 눌러야 한다(몇 분). 이를 피하려면 Vercel Cron으로 하루 1회 가벼운 쿼리를 보내거나 Pro($25/월)로 올린다.
- 개인정보(학생 연락처·주소)가 국외 서비스에 저장되는 점은 지금(Google)과 같다. 접근 키는 서버 환경변수에만 둔다.

**차선책**
- **Neon으로 복귀**: 코드 변경이 가장 적다(이전 Prisma 코드가 git에 있음). 대신 싱가포르 리전 지연과 5분 자동 정지 후 콜드스타트(첫 화면 1초 안팎)가 있다.
- **Turso**: 가장 가볍고 빠르지만, 관리자가 표에서 직접 고치는 편의는 떨어진다.

## 4. Supabase로 바꾸면 고쳐야 할 것

이번 업그레이드에서 **저장소 접근을 `src/server/db/repository.ts` 한 곳으로 모아 두었기 때문에** 화면·API·검증 코드는 그대로 두고 저장소 계층만 바꾸면 된다.

| 영역 | 변경 | 규모 |
|---|---|---|
| `src/server/db/sheets-client.ts`, `sheet-requests.ts`, `dataset.ts`, `warmup.ts`, `apps-script/Code.gs` | 삭제 (Apps Script 전송 계층 전부) | — |
| `src/server/db/sheet-schema.ts` | 테이블·컬럼 정의 → Prisma 스키마 또는 SQL 마이그레이션 9개 테이블로 옮김 (컬럼 이름은 그대로 사용 가능) | 0.5일 |
| `src/server/db/repository.ts` | `getStoreSnapshot()`는 테이블 9개 `SELECT *`(작은 규모라 그대로 유지 가능), 쓰기 함수 20여 개는 SQL 트랜잭션으로 교체. `runWrite`/revision 재시도 제거 | 1.5~2일 |
| `src/server/attendance/*`, `src/app/**` | **변경 없음** (스냅샷 타입만 맞추면 됨) | — |
| `scripts/sheets-setup.ts` | 시트 → Supabase 데이터 이전 스크립트로 교체 (`backups/` CSV를 Table Editor에서 바로 가져와도 됨) | 0.5일 |
| 환경변수 | `APPS_SCRIPT_URL/TOKEN` → `DATABASE_URL`(Supabase Postgres 연결 문자열, Vercel은 pooler 주소 사용) | — |
| 문서 | CLAUDE.md 저장소 절, README 준비 절 | 0.5일 |

합계 약 **3~4일**. 이전 순서는 (1) Supabase 프로젝트(서울) 생성 → (2) 스키마 적용 → (3) `yarn sheets:migrate`처럼 시트 CSV 백업을 만들고 Table Editor로 가져오기 → (4) 코드 교체·검증 → (5) 환경변수 바꿔 배포 → (6) 시트는 읽기 전용 백업으로 보관.

## 5. 당장 바꾸지 않아도 되는 경우

- 교사 5~10명이 주일 오전에만 쓰고, 저장 2~3초를 감내할 수 있으면 지금 구조로 1~2년은 운영 가능하다(20초 캐시로 조회는 빠름).
- 다음 신호가 보이면 옮길 때다: 출석 체크 저장 실패/지연 불만, 시트 행 2~3만 건 초과로 첫 화면이 6초 이상, 관리자가 시트를 직접 고치다 헤더를 깨뜨리는 사고 반복.

## 참고 링크
- Supabase 요금: https://supabase.com/pricing · 리전: https://supabase.com/docs/guides/platform/regions · CSV 가져오기: https://supabase.com/docs/guides/database/import-data
- Neon 요금: https://neon.com/docs/introduction/plans · 리전: https://neon.com/docs/introduction/regions
- Turso 요금: https://turso.tech/pricing
- Apps Script 할당량: https://developers.google.com/apps-script/guides/services/quotas
