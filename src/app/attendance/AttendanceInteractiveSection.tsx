'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/common/ToastProvider';
import {
  CLASS_SCOPE_ALL,
  CLASS_SCOPE_UNASSIGNED,
  type ClassScope,
  getGenderLabel,
  getGradeDisplayLabel,
  toClassScopeParam,
} from '@/lib/attendance-display';
import { getButtonClassName } from '@/lib/button';
import { AttendanceStatus, Gender } from '@/types/domain';
import { formatDateToKoreanYmd } from '@/utils/date';

import CollapsiblePanel from './CollapsiblePanel';
import NewFriendPanel, { type SerializableNewFriendRow } from './NewFriendPanel';

type SerializableStudentRow = {
  id: string;
  name: string;
  gender: Gender;
  birthDate: string;
  currentTalent: number;
  weeklyExtraTalent: number;
  gradeLabel: string;
  attendanceStatus: AttendanceStatus;
  className: string | null;
  isNewFriend: boolean;
};

type SerializableTalentLogRow = {
  id: string;
  amount: number;
  transactedAt: string;
  student: { name: string };
  teacher: { name: string | null; email: string } | null;
};

type ClassOption = {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  isMine: boolean;
  studentCount: number;
};

type ClassOptionGroup = {
  departmentId: string;
  departmentName: string;
  classes: ClassOption[];
};

export type InteractiveAttendancePayload = {
  scope: ClassScope;
  schoolYear: number;
  classGroups: ClassOptionGroup[];
  unassignedCount: number;
  studentsForTable: SerializableStudentRow[];
  newFriends: SerializableNewFriendRow[];
  talentLogs: SerializableTalentLogRow[];
};

type AttendanceInteractiveSectionProps = {
  attendanceDateText: string;
  nextSundayDateText: string;
  initialData: InteractiveAttendancePayload;
};

type ToggleAttendanceInput = {
  studentId: string;
  expectedCurrentStatus: AttendanceStatus;
  nextStatus: AttendanceStatus;
};

type AdjustTalentInput = {
  studentId: string;
  amount: number;
};

type ToggleAttendanceResponse = {
  message: 'ok';
  student_id: string;
  next_status: AttendanceStatus;
  current_talent: number;
  talent_delta: number;
};

type AdjustTalentResponse = {
  message: 'ok';
  student_id: string;
  student_name: string;
  current_talent: number;
  weekly_extra_talent: number;
  transaction: {
    id: string;
    amount: number;
    transacted_at: string;
    teacher: { name: string | null; email: string | null };
  };
};

const CHIP_BASE_CLASS_NAME =
  'inline-flex items-center justify-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition';
const CHIP_SELECTED_CLASS_NAME =
  'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]';
const CHIP_IDLE_CLASS_NAME =
  'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-soft)]';

/**
 * 출석 화면 데이터를 조회한다.
 */
async function fetchInteractiveAttendance(scopeParam: string): Promise<InteractiveAttendancePayload> {
  const response = await fetch(`/api/attendance/interactive?class_id=${encodeURIComponent(scopeParam)}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('interactive_fetch_failed');
  }

  return response.json();
}

/**
 * 출석 토글 API를 호출한다.
 */
async function requestToggleAttendance(input: ToggleAttendanceInput): Promise<ToggleAttendanceResponse> {
  const response = await fetch('/api/attendance/interactive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      action: 'toggle_attendance',
      student_id: input.studentId,
      expected_current_status: input.expectedCurrentStatus,
      next_status: input.nextStatus,
    }),
  });

  if (!response.ok) {
    throw new Error(response.status === 409 ? 'stale_state' : 'attendance_toggle_failed');
  }

  return (await response.json()) as ToggleAttendanceResponse;
}

/**
 * 달란트 조정 API를 호출한다.
 */
async function requestAdjustTalent(input: AdjustTalentInput): Promise<AdjustTalentResponse> {
  const response = await fetch('/api/attendance/interactive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ action: 'adjust_talent', student_id: input.studentId, amount: input.amount }),
  });

  if (!response.ok) {
    throw new Error('talent_adjust_failed');
  }

  return (await response.json()) as AdjustTalentResponse;
}

/**
 * 달란트 변동 시각을 한국시간으로 표시한다.
 */
function formatLogTime(isoText: string): string {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(
    new Date(isoText)
  );
}

/**
 * 달란트 조정 버튼 묶음을 렌더링한다. 결석 상태에서는 비활성화한다.
 */
function TalentAdjustButtons({
  student,
  onAdjust,
}: {
  student: SerializableStudentRow;
  onAdjust: (studentId: string, amount: number) => void;
}) {
  const isPresent = student.attendanceStatus === AttendanceStatus.PRESENT;

  return (
    <div className="flex flex-wrap gap-1.5">
      {[3, 2, 1].map((amount) => (
        <button
          key={`${student.id}-${amount}`}
          type="button"
          disabled={!isPresent}
          title={isPresent ? undefined : '출석한 학생에게만 달란트를 줄 수 있습니다.'}
          onClick={() => onAdjust(student.id, amount)}
          className={getButtonClassName({
            variant: 'secondary',
            tone: 'success',
            size: 'sm',
            round: 'pill',
            className: 'min-w-[42px]',
          })}
        >
          +{amount}
        </button>
      ))}
      <button
        type="button"
        disabled={!isPresent}
        onClick={() => onAdjust(student.id, -1)}
        className={getButtonClassName({
          variant: 'secondary',
          tone: 'danger',
          size: 'sm',
          round: 'pill',
          className: 'min-w-[42px]',
        })}
      >
        -1
      </button>
    </div>
  );
}

/**
 * 반 단위 출석 관리 화면을 렌더링한다. 출석·달란트는 낙관적 업데이트로 즉시 반영한다.
 */
export default function AttendanceInteractiveSection({
  attendanceDateText,
  nextSundayDateText,
  initialData,
}: AttendanceInteractiveSectionProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const scopeParam = toClassScopeParam(initialData.scope);
  const queryKey = useMemo(() => ['attendance', 'interactive', scopeParam] as const, [scopeParam]);
  const [isNewFriendFormOpen, setIsNewFriendFormOpen] = useState(false);

  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchInteractiveAttendance(scopeParam),
    initialData,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  /**
   * 캐시된 학생 행을 부분 갱신한다.
   */
  function patchStudent(studentId: string, patch: Partial<SerializableStudentRow>) {
    queryClient.setQueryData<InteractiveAttendancePayload>(queryKey, (current) =>
      current
        ? {
            ...current,
            studentsForTable: current.studentsForTable.map((student) =>
              student.id === studentId ? { ...student, ...patch } : student
            ),
          }
        : current
    );
  }

  const toggleAttendanceMutation = useMutation({
    mutationFn: requestToggleAttendance,
    onMutate: async ({ studentId, nextStatus }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<InteractiveAttendancePayload>(queryKey);
      patchStudent(studentId, { attendanceStatus: nextStatus });
      return { previousData };
    },
    onSuccess: (responsePayload) => {
      patchStudent(responsePayload.student_id, {
        attendanceStatus: responsePayload.next_status,
        currentTalent: responsePayload.current_talent,
      });
      // 새친구 출석 횟수는 서버 계산이라 다시 읽는다(응답 후 백그라운드).
      if (data.newFriends.some((newFriend) => newFriend.id === responsePayload.student_id)) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (error, _input, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }

      if (error instanceof Error && error.message === 'stale_state') {
        showToast({
          variant: 'info',
          message: '다른 교사가 먼저 출석 상태를 변경했습니다.',
          description: '최신 상태를 다시 불러옵니다.',
        });
        queryClient.invalidateQueries({ queryKey });
      } else {
        showToast({
          variant: 'error',
          message: '출석 상태 변경에 실패했습니다.',
          description: '잠시 후 다시 시도해 주세요.',
        });
      }
    },
  });

  const adjustTalentMutation = useMutation({
    mutationFn: requestAdjustTalent,
    onMutate: async ({ studentId, amount }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<InteractiveAttendancePayload>(queryKey);
      const current = previousData?.studentsForTable.find((student) => student.id === studentId);
      patchStudent(studentId, { weeklyExtraTalent: (current?.weeklyExtraTalent ?? 0) + amount });
      return { previousData };
    },
    onSuccess: (responsePayload) => {
      queryClient.setQueryData<InteractiveAttendancePayload>(queryKey, (current) => {
        if (!current) {
          return current;
        }

        const resolvedStudentName =
          responsePayload.student_name ||
          current.studentsForTable.find((student) => student.id === responsePayload.student_id)?.name ||
          '-';

        return {
          ...current,
          studentsForTable: current.studentsForTable.map((student) =>
            student.id === responsePayload.student_id
              ? {
                  ...student,
                  weeklyExtraTalent: responsePayload.weekly_extra_talent,
                  currentTalent: responsePayload.current_talent,
                }
              : student
          ),
          talentLogs: [
            {
              id: responsePayload.transaction.id,
              amount: responsePayload.transaction.amount,
              transactedAt: responsePayload.transaction.transacted_at,
              student: { name: resolvedStudentName },
              teacher: {
                name: responsePayload.transaction.teacher.name,
                email: responsePayload.transaction.teacher.email ?? '',
              },
            },
            ...current.talentLogs,
          ].slice(0, 40),
        };
      });
      showToast({ variant: 'success', message: '달란트를 조정했습니다.' });
    },
    onError: (_error, _input, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      showToast({
        variant: 'error',
        message: '달란트 조정에 실패했습니다.',
        description: '잠시 후 다시 시도해 주세요.',
      });
    },
  });

  const { scope, classGroups, unassignedCount, studentsForTable, newFriends, talentLogs } = data;
  const presentCount = studentsForTable.filter(
    (student) => student.attendanceStatus === AttendanceStatus.PRESENT
  ).length;
  const shouldShowClassColumn = scope.kind !== 'class';
  const selectedClass = classGroups
    .flatMap((group) => group.classes)
    .find((option) => scope.kind === 'class' && option.id === scope.classId);
  const scopeTitle =
    scope.kind === 'class'
      ? `${selectedClass?.departmentName ?? ''} ${selectedClass?.name ?? ''}`.trim()
      : scope.kind === 'unassigned'
        ? '미배정 학생'
        : '전체 학생';

  /**
   * 출석 상태를 토글한다.
   */
  function handleToggleAttendance(student: SerializableStudentRow) {
    const isPresent = student.attendanceStatus === AttendanceStatus.PRESENT;

    toggleAttendanceMutation.mutate({
      studentId: student.id,
      expectedCurrentStatus: student.attendanceStatus,
      nextStatus: isPresent ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT,
    });
  }

  /**
   * 달란트를 조정한다.
   */
  function handleAdjustTalent(studentId: string, amount: number) {
    adjustTalentMutation.mutate({ studentId, amount });
  }

  /**
   * 학년(생일) 표시 문자열을 만든다.
   */
  function getStudentGradeDisplayLabel(student: SerializableStudentRow): string {
    return getGradeDisplayLabel({ gradeLabel: student.gradeLabel as never, birthDate: new Date(student.birthDate) });
  }

  /**
   * 출석 버튼을 렌더링한다.
   */
  function renderAttendanceButton(student: SerializableStudentRow) {
    const isPresent = student.attendanceStatus === AttendanceStatus.PRESENT;

    return (
      <button
        type="button"
        onClick={() => handleToggleAttendance(student)}
        aria-pressed={isPresent}
        className={getButtonClassName({
          variant: 'primary',
          tone: isPresent ? 'danger' : 'success',
          size: 'sm',
          round: 'pill',
          className: 'min-w-[68px]',
        })}
      >
        {isPresent ? '출석 취소' : '출석'}
      </button>
    );
  }

  return (
    <>
      <section className="mx-auto w-full max-w-5xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">출석 관리</h1>
          <p className="text-sm text-[var(--color-muted)]">
            기준 출석일: {attendanceDateText}
            <span className="block sm:inline">
              <span className="hidden sm:inline"> / </span>
              수정 가능 기한: {nextSundayDateText} 이전
            </span>
          </p>
        </div>

        <nav className="mt-5 flex flex-col gap-2" aria-label="반 선택">
          {classGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] px-3 py-3 text-sm text-[var(--color-muted)]">
              아직 등록된 반이 없습니다. 관리자가 [조직 관리]에서 부서와 반을 만들면 반별로 출석을 체크할 수 있습니다.
            </p>
          ) : (
            classGroups.map((group) => (
              <div key={group.departmentId} className="flex flex-wrap items-center gap-2">
                <span className="w-16 shrink-0 text-xs font-semibold text-[var(--color-muted)]">
                  {group.departmentName}
                </span>
                {group.classes.map((classOption) => {
                  const isSelected = scope.kind === 'class' && scope.classId === classOption.id;

                  return (
                    <Link
                      key={classOption.id}
                      href={`/attendance?class_id=${encodeURIComponent(classOption.id)}`}
                      prefetch={false}
                      aria-current={isSelected ? 'page' : undefined}
                      className={`${CHIP_BASE_CLASS_NAME} ${isSelected ? CHIP_SELECTED_CLASS_NAME : CHIP_IDLE_CLASS_NAME}`}
                    >
                      {classOption.isMine ? <span aria-label="내 반">★</span> : null}
                      {classOption.name}
                      <span className="text-xs text-[var(--color-muted)]">{classOption.studentCount}</span>
                    </Link>
                  );
                })}
              </div>
            ))
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-semibold text-[var(--color-muted)]">기타</span>
            {unassignedCount > 0 ? (
              <Link
                href={`/attendance?class_id=${CLASS_SCOPE_UNASSIGNED}`}
                prefetch={false}
                className={`${CHIP_BASE_CLASS_NAME} ${scope.kind === 'unassigned' ? CHIP_SELECTED_CLASS_NAME : CHIP_IDLE_CLASS_NAME}`}
              >
                미배정 <span className="text-xs text-[var(--color-muted)]">{unassignedCount}</span>
              </Link>
            ) : null}
            <Link
              href={`/attendance?class_id=${CLASS_SCOPE_ALL}`}
              prefetch={false}
              className={`${CHIP_BASE_CLASS_NAME} ${scope.kind === 'all' ? CHIP_SELECTED_CLASS_NAME : CHIP_IDLE_CLASS_NAME}`}
            >
              전체
            </Link>
          </div>
        </nav>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">{scopeTitle}</h2>
          <p className="text-sm text-[var(--color-muted)]">
            출석 <span className="font-semibold text-[var(--color-primary)]">{presentCount}</span> /{' '}
            {studentsForTable.length}명
          </p>
        </div>

        <div className="mt-3 sm:hidden">
          {studentsForTable.length === 0 ? (
            <p className="rounded-xl border border-[var(--color-border)] px-3 py-3 text-center text-sm text-[var(--color-muted)]">
              표시할 학생이 없습니다.
            </p>
          ) : (
            <ul className="grid gap-3">
              {studentsForTable.map((student) => (
                <li
                  key={student.id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-base font-semibold text-[var(--color-text)]">
                      {student.name}
                      {student.isNewFriend ? (
                        <span className="ml-1.5 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs text-[var(--color-primary)]">
                          새친구
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm font-medium text-[var(--color-primary)]">
                      {shouldShowClassColumn && student.className ? `${student.className} · ` : ''}
                      {getStudentGradeDisplayLabel(student)}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-[var(--color-muted)]">성별 / 생일</dt>
                    <dd className="text-right text-[var(--color-text)]">
                      {getGenderLabel(student.gender)} / {formatDateToKoreanYmd(new Date(student.birthDate))}
                    </dd>
                    <dt className="text-[var(--color-muted)]">금주 추가 달란트</dt>
                    <dd className="text-right font-semibold text-[var(--color-text)]">
                      {student.weeklyExtraTalent > 0 ? `+${student.weeklyExtraTalent}` : student.weeklyExtraTalent}
                    </dd>
                  </dl>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <TalentAdjustButtons student={student} onAdjust={handleAdjustTalent} />
                    {renderAttendanceButton(student)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 hidden overflow-x-auto rounded-xl border border-[var(--color-border)] sm:block">
          <table className="w-full border-collapse text-center">
            <thead className="bg-[var(--color-surface-soft)]">
              <tr>
                {shouldShowClassColumn ? (
                  <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">반</th>
                ) : null}
                <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">이름</th>
                <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">학년</th>
                <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">성별</th>
                <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">생일</th>
                <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">출석</th>
                <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">금주 추가</th>
                <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">달란트 조정</th>
              </tr>
            </thead>
            <tbody>
              {studentsForTable.length === 0 ? (
                <tr>
                  <td
                    colSpan={shouldShowClassColumn ? 8 : 7}
                    className="px-2 py-3 text-center text-sm text-[var(--color-muted)]"
                  >
                    표시할 학생이 없습니다.
                  </td>
                </tr>
              ) : (
                studentsForTable.map((student) => (
                  <tr key={student.id} className="border-t border-[var(--color-border)]">
                    {shouldShowClassColumn ? (
                      <td className="px-2 py-2 text-sm text-[var(--color-muted)]">{student.className ?? '미배정'}</td>
                    ) : null}
                    <td className="px-2 py-2 text-sm font-medium text-[var(--color-text)]">
                      {student.name}
                      {student.isNewFriend ? (
                        <span className="ml-1.5 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs text-[var(--color-primary)]">
                          새친구
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-sm text-[var(--color-muted)]">
                      {getStudentGradeDisplayLabel(student)}
                    </td>
                    <td className="px-2 py-2 text-sm text-[var(--color-muted)]">{getGenderLabel(student.gender)}</td>
                    <td className="px-2 py-2 text-sm text-[var(--color-muted)]">
                      {formatDateToKoreanYmd(new Date(student.birthDate))}
                    </td>
                    <td className="px-2 py-2">{renderAttendanceButton(student)}</td>
                    <td className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">
                      {student.weeklyExtraTalent > 0 ? `+${student.weeklyExtraTalent}` : student.weeklyExtraTalent}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-center">
                        <TalentAdjustButtons student={student} onAdjust={handleAdjustTalent} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <NewFriendPanel
        newFriends={newFriends}
        classGroups={classGroups}
        defaultClassId={scope.kind === 'class' ? scope.classId : ''}
        isFormOpen={isNewFriendFormOpen}
        onToggleForm={() => setIsNewFriendFormOpen((previous) => !previous)}
        onChanged={() => queryClient.invalidateQueries({ queryKey })}
        onSettledLocally={(studentId) =>
          queryClient.setQueryData<InteractiveAttendancePayload>(queryKey, (current) =>
            current
              ? {
                  ...current,
                  newFriends: current.newFriends.filter((newFriend) => newFriend.id !== studentId),
                  studentsForTable: current.studentsForTable.map((student) =>
                    student.id === studentId ? { ...student, isNewFriend: false } : student
                  ),
                }
              : current
          )
        }
      />

      <CollapsiblePanel
        title="달란트 변동 기록"
        description="출석을 제외한 금주 추가 달란트 조정 내역을 최신순으로 기록합니다."
        storageKey="attendance_talent_log_collapsible"
      >
        {talentLogs.length === 0 ? (
          <p className="rounded-xl border border-[var(--color-border)] px-3 py-3 text-center text-sm text-[var(--color-muted)]">
            달란트 변동 기록이 없습니다.
          </p>
        ) : (
          <>
            <ul className="grid gap-3 sm:hidden">
              {talentLogs.map((log) => (
                <li
                  key={log.id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--color-text)]">{log.student.name}</p>
                    <p
                      className={`text-sm font-semibold ${log.amount >= 0 ? 'text-[var(--color-primary)]' : 'text-[var(--color-danger)]'}`}
                    >
                      {log.amount > 0 ? `+${log.amount}` : log.amount}
                    </p>
                  </div>
                  <p className="mt-1 break-all text-xs text-[var(--color-muted)]">
                    처리 교사: {log.teacher?.name ?? log.teacher?.email ?? '-'}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">시각: {formatLogTime(log.transactedAt)}</p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded-xl border border-[var(--color-border)] sm:block">
              <table className="w-full border-collapse text-center">
                <thead className="bg-[var(--color-surface-soft)]">
                  <tr>
                    <th className="w-1/4 px-2 py-2 text-sm font-semibold text-[var(--color-text)]">학생</th>
                    <th className="w-1/4 px-2 py-2 text-sm font-semibold text-[var(--color-text)]">변동</th>
                    <th className="w-1/4 px-2 py-2 text-sm font-semibold text-[var(--color-text)]">처리 교사</th>
                    <th className="w-1/4 px-2 py-2 text-sm font-semibold text-[var(--color-text)]">시각</th>
                  </tr>
                </thead>
                <tbody>
                  {talentLogs.map((log) => (
                    <tr key={log.id} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-2 text-sm text-[var(--color-text)]">{log.student.name}</td>
                      <td
                        className={`px-2 py-2 text-sm font-semibold ${log.amount >= 0 ? 'text-[var(--color-primary)]' : 'text-[var(--color-danger)]'}`}
                      >
                        {log.amount > 0 ? `+${log.amount}` : log.amount}
                      </td>
                      <td className="px-2 py-2 text-sm text-[var(--color-muted)]">
                        {log.teacher?.name ?? log.teacher?.email ?? '-'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-sm text-[var(--color-muted)]">
                        {formatLogTime(log.transactedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CollapsiblePanel>
    </>
  );
}
