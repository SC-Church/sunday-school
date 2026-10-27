import type { Metadata } from 'next';

import Link from 'next/link';

import { getServerSession } from 'next-auth';

import AttendanceTrendChart from '@/components/common/AttendanceTrendChart';
import { CLASS_SCOPE_ALL, type ClassScope, parseClassScope } from '@/lib/attendance-display';
import { authOptions } from '@/lib/auth';
import { parseSchoolYearParam } from '@/lib/validation/organization';
import { buildClassGroups, resolveDefaultClassScope } from '@/server/attendance/service';
import { type AttendanceStatsScope, buildAttendanceStats } from '@/server/attendance/stats';
import { getStoreSnapshot } from '@/server/db/repository';
import { getSchoolYearInKst } from '@/utils/grade';

import StudentAttendanceLedgerButton from '../../students/StudentAttendanceLedgerButton';

export const metadata: Metadata = {
  title: '출석 통계',
};

type AttendanceStatsPageProps = {
  searchParams?: Promise<{
    class_id?: string | string[];
    school_year?: string | string[];
  }>;
};

const CHIP_BASE_CLASS_NAME =
  'inline-flex items-center justify-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition';
const CHIP_SELECTED_CLASS_NAME =
  'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]';
const CHIP_IDLE_CLASS_NAME =
  'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-soft)]';

/**
 * 통계 화면의 링크를 만든다.
 */
function buildStatsHref(schoolYear: number, classScopeParam: string): string {
  return `/attendance/stats?school_year=${schoolYear}&class_id=${encodeURIComponent(classScopeParam)}`;
}

/**
 * 반별·개인별 출석 통계 페이지를 렌더링한다(학년도·반 선택).
 */
export default async function AttendanceStatsPage({ searchParams }: AttendanceStatsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getServerSession(authOptions);
  const snapshot = await getStoreSnapshot();
  const currentSchoolYear = getSchoolYearInKst();
  const schoolYear = parseSchoolYearParam(resolvedSearchParams?.school_year, currentSchoolYear);
  const classGroups = buildClassGroups(snapshot, schoolYear, session?.user?.id ?? null);
  const requestedScope = parseClassScope(resolvedSearchParams?.class_id);
  const resolvedScope: ClassScope =
    requestedScope && requestedScope.kind !== 'unassigned' ? requestedScope : resolveDefaultClassScope(classGroups);
  // 통계는 반 또는 전체만 지원한다(미배정은 출석 화면에서만 쓰는 범위).
  const scope: AttendanceStatsScope = resolvedScope.kind === 'class' ? resolvedScope : { kind: 'all' };
  const stats = buildAttendanceStats({
    schoolYear,
    scope,
    students: snapshot.students,
    enrollments: snapshot.enrollments,
    attendances: snapshot.attendances,
    classes: snapshot.classes,
  });
  const selectedClass = classGroups
    .flatMap((group) => group.classes)
    .find((option) => scope.kind === 'class' && option.id === scope.classId);
  const scopeTitle =
    scope.kind === 'class' ? `${selectedClass?.departmentName ?? ''} ${selectedClass?.name ?? ''}`.trim() : '전체';
  const availableSchoolYears = Array.from(
    new Set([
      currentSchoolYear,
      ...snapshot.classes.map((classRecord) => classRecord.schoolYear),
      ...snapshot.enrollments.map((enrollment) => enrollment.schoolYear),
    ])
  ).sort((a, b) => b - a);
  const recentWeeks = stats.weeks.slice(-12);

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-8 sm:px-6">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">출석 통계</h1>
          <nav className="flex flex-wrap gap-2" aria-label="학년도 선택">
            {availableSchoolYears.map((year) => (
              <Link
                key={year}
                href={buildStatsHref(year, CLASS_SCOPE_ALL)}
                prefetch={false}
                aria-current={year === schoolYear ? 'page' : undefined}
                className={`${CHIP_BASE_CLASS_NAME} ${year === schoolYear ? CHIP_SELECTED_CLASS_NAME : CHIP_IDLE_CLASS_NAME}`}
              >
                {year}학년도
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {schoolYear}년 3월부터 {schoolYear + 1}년 2월까지의 주일 출석을 집계합니다. 출석률은 그 반에 소속되어 있던 주
          기준입니다.
        </p>

        <nav className="mt-5 flex flex-col gap-2" aria-label="반 선택">
          {classGroups.map((group) => (
            <div key={group.departmentId} className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 text-xs font-semibold text-[var(--color-muted)]">
                {group.departmentName}
              </span>
              {group.classes.map((classOption) => {
                const isSelected = scope.kind === 'class' && scope.classId === classOption.id;

                return (
                  <Link
                    key={classOption.id}
                    href={buildStatsHref(schoolYear, classOption.id)}
                    prefetch={false}
                    aria-current={isSelected ? 'page' : undefined}
                    className={`${CHIP_BASE_CLASS_NAME} ${isSelected ? CHIP_SELECTED_CLASS_NAME : CHIP_IDLE_CLASS_NAME}`}
                  >
                    {classOption.isMine ? <span aria-label="내 반">★</span> : null}
                    {classOption.name}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-semibold text-[var(--color-muted)]">기타</span>
            <Link
              href={buildStatsHref(schoolYear, CLASS_SCOPE_ALL)}
              prefetch={false}
              className={`${CHIP_BASE_CLASS_NAME} ${scope.kind === 'all' ? CHIP_SELECTED_CLASS_NAME : CHIP_IDLE_CLASS_NAME}`}
            >
              전체
            </Link>
          </div>
        </nav>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
            <p className="text-xs text-[var(--color-muted)]">{scopeTitle} 재적</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{stats.totalStudentCount}명</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
            <p className="text-xs text-[var(--color-muted)]">평균 출석률</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-primary)]">{stats.averageAttendanceRate}%</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
            <p className="text-xs text-[var(--color-muted)]">집계 주차</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{stats.weeks.length}주</p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-[var(--color-border)] p-3">
          <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">주차별 출석 인원 (최근 12주)</p>
          {stats.weeks.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">아직 집계할 주차가 없습니다.</p>
          ) : (
            <AttendanceTrendChart data={stats.weeklyPresentCounts.slice(-12)} />
          )}
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full border-collapse text-center text-sm">
            <thead className="bg-[var(--color-surface-soft)]">
              <tr>
                <th className="sticky left-0 z-10 bg-[var(--color-surface-soft)] px-2 py-2 text-left font-semibold text-[var(--color-text)]">
                  이름
                </th>
                {scope.kind !== 'class' ? (
                  <th className="px-2 py-2 font-semibold text-[var(--color-text)]">반</th>
                ) : null}
                <th className="px-2 py-2 font-semibold text-[var(--color-text)]">출석</th>
                <th className="px-2 py-2 font-semibold text-[var(--color-text)]">출석률</th>
                {recentWeeks.map((week) => (
                  <th
                    key={week.date}
                    className="whitespace-nowrap px-1.5 py-2 text-xs font-medium text-[var(--color-muted)]"
                  >
                    {week.label}
                  </th>
                ))}
                <th className="px-2 py-2 font-semibold text-[var(--color-text)]">개인 출석부</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.length === 0 ? (
                <tr>
                  <td colSpan={recentWeeks.length + 5} className="px-2 py-3 text-[var(--color-muted)]">
                    집계할 학생이 없습니다.
                  </td>
                </tr>
              ) : (
                stats.rows.map((row) => (
                  <tr key={row.studentId} className="border-t border-[var(--color-border)]">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--color-surface)] px-2 py-2 text-left font-medium text-[var(--color-text)]">
                      {row.name}
                    </td>
                    {scope.kind !== 'class' ? (
                      <td className="px-2 py-2 text-[var(--color-muted)]">{row.className ?? '미배정'}</td>
                    ) : null}
                    <td className="px-2 py-2 font-semibold text-[var(--color-text)]">
                      {row.presentCount}
                      <span className="text-xs font-normal text-[var(--color-muted)]">/{row.eligibleWeekCount}</span>
                    </td>
                    <td className="px-2 py-2 font-semibold text-[var(--color-primary)]">{row.attendanceRate}%</td>
                    {recentWeeks.map((week) => {
                      const status = row.statusByWeek[week.date];

                      return (
                        <td key={week.date} className="px-1.5 py-2">
                          {status === 'PRESENT' ? (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]"
                              aria-label="출석"
                            />
                          ) : status === 'ABSENT' ? (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--color-border-strong)]"
                              aria-label="결석"
                            />
                          ) : (
                            <span className="text-xs text-[var(--color-muted)]">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2">
                      <StudentAttendanceLedgerButton studentId={row.studentId} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          ● 출석 · ○ 결석 · - 소속 아님. 전체 주차는 [개인 출석부]에서 볼 수 있습니다.
        </p>
      </section>
    </main>
  );
}
