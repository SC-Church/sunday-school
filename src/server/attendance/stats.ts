import type { AttendanceRecord, ClassRecord, EnrollmentRecord, StudentRecord } from '@/server/db/sheet-schema';
import { AttendanceStatus, EnrollmentStatus } from '@/types/domain';
import { formatDateToKoreanYmd, getSchoolYearSundays, getSundayOfWeekInKst } from '@/utils/date';

// 반별/개인별 출석 통계를 계산하는 순수 함수. 스냅샷 배열만 받으므로 DB 없이 테스트할 수 있다.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type AttendanceStatsScope = { kind: 'all' } | { kind: 'class'; classId: string };

export type AttendanceStatsWeek = {
  /** yyyy-mm-dd */
  date: string;
  /** mm.dd */
  label: string;
};

export type AttendanceStatsRow = {
  studentId: string;
  name: string;
  className: string | null;
  presentCount: number;
  /** 소속되어 있던(집계 대상) 주 수 */
  eligibleWeekCount: number;
  /** 0~100, 소수점 없음. eligibleWeekCount가 0이면 0 */
  attendanceRate: number;
  /** 주차 날짜 → 출석 여부. 소속이 아니었던 주는 키가 없다 */
  statusByWeek: Record<string, 'PRESENT' | 'ABSENT'>;
};

export type AttendanceStats = {
  weeks: AttendanceStatsWeek[];
  rows: AttendanceStatsRow[];
  weeklyPresentCounts: Array<{ label: string; count: number }>;
  totalStudentCount: number;
  averageAttendanceRate: number;
};

/**
 * 출석 행이 어느 반의 출석인지 정한다. 기록된 classId를 우선하고, 없으면(컬럼 추가 전 행) 그 날짜에 유효했던 배정,
 * 그것도 없으면 해당 학년도의 마지막 배정을 쓴다(이전 데이터를 옮긴 직후에도 현재 반 통계에 잡히도록).
 */
export function resolveAttendanceClassId(
  attendance: Pick<AttendanceRecord, 'studentId' | 'attendanceDate' | 'classId'>,
  enrollmentsOfStudent: ReadonlyArray<EnrollmentRecord>,
  schoolYear: number
): string | null {
  if (attendance.classId) {
    return attendance.classId;
  }

  const yearEnrollments = enrollmentsOfStudent.filter((enrollment) => enrollment.schoolYear === schoolYear);
  const weekEnd = new Date(attendance.attendanceDate.getTime() + WEEK_MS);
  const covering = yearEnrollments.find(
    (enrollment) =>
      enrollment.startedAt < weekEnd && (enrollment.endedAt === null || enrollment.endedAt > attendance.attendanceDate)
  );

  if (covering) {
    return covering.classId;
  }

  const latest = [...yearEnrollments].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
  return latest?.classId ?? null;
}

/**
 * 학년도 주차 목록 중 기준일이 속한 주까지만 남긴다(미래 주는 표에 넣지 않는다).
 */
export function getElapsedSchoolYearWeeks(schoolYear: number, baseDate: Date = new Date()): AttendanceStatsWeek[] {
  const currentSunday = getSundayOfWeekInKst(baseDate);

  return getSchoolYearSundays(schoolYear)
    .filter((sunday) => sunday <= currentSunday)
    .map((sunday) => {
      const ymd = formatDateToKoreanYmd(sunday);
      return { date: ymd, label: ymd.slice(5).replace('-', '.') };
    });
}

/**
 * 학년도·범위(전체 또는 반)에 대한 출석 통계를 만든다.
 */
export function buildAttendanceStats({
  schoolYear,
  scope,
  students,
  enrollments,
  attendances,
  classes,
  baseDate = new Date(),
}: {
  schoolYear: number;
  scope: AttendanceStatsScope;
  students: ReadonlyArray<StudentRecord>;
  enrollments: ReadonlyArray<EnrollmentRecord>;
  attendances: ReadonlyArray<AttendanceRecord>;
  classes: ReadonlyArray<ClassRecord>;
  baseDate?: Date;
}): AttendanceStats {
  const weeks = getElapsedSchoolYearWeeks(schoolYear, baseDate);
  const weekDateSet = new Set(weeks.map((week) => week.date));
  const classNameById = new Map(classes.map((classRecord) => [classRecord.id, classRecord.name]));
  const enrollmentsByStudentId = new Map<string, EnrollmentRecord[]>();
  enrollments.forEach((enrollment) => {
    const list = enrollmentsByStudentId.get(enrollment.studentId) ?? [];
    list.push(enrollment);
    enrollmentsByStudentId.set(enrollment.studentId, list);
  });

  /**
   * 학생이 해당 주에 집계 대상(범위 안 소속)인지와 출석 여부를 정한다.
   */
  const resolveWeekMembership = (
    student: StudentRecord,
    weekDate: string,
    attendance: AttendanceRecord | undefined
  ): { isMember: boolean; isPresent: boolean } => {
    const studentEnrollments = enrollmentsByStudentId.get(student.id) ?? [];
    const sunday = new Date(`${weekDate}T00:00:00+09:00`);
    const resolvedClassId = resolveAttendanceClassId(
      { studentId: student.id, attendanceDate: sunday, classId: attendance?.classId ?? null },
      studentEnrollments,
      schoolYear
    );
    const isPresent = attendance?.status === AttendanceStatus.PRESENT;

    if (scope.kind === 'class') {
      return { isMember: resolvedClassId === scope.classId, isPresent };
    }

    // 전체 범위: 그 학년도에 배정 이력이 있거나 출석 기록이 있는 학생은 첫 소속 주부터 집계한다.
    const firstMembershipTime = Math.min(
      ...studentEnrollments
        .filter((enrollment) => enrollment.schoolYear === schoolYear)
        .map((enrollment) => enrollment.startedAt.getTime() - WEEK_MS),
      ...attendances
        .filter(
          (record) => record.studentId === student.id && weekDateSet.has(formatDateToKoreanYmd(record.attendanceDate))
        )
        .map((record) => record.attendanceDate.getTime())
    );

    return { isMember: Number.isFinite(firstMembershipTime) && sunday.getTime() >= firstMembershipTime, isPresent };
  };

  const attendanceByStudentAndWeek = new Map<string, AttendanceRecord>();
  attendances.forEach((attendance) => {
    attendanceByStudentAndWeek.set(
      `${attendance.studentId}:${formatDateToKoreanYmd(attendance.attendanceDate)}`,
      attendance
    );
  });

  const rows: AttendanceStatsRow[] = [];
  const weeklyPresentCounts = weeks.map((week) => ({ label: week.label, count: 0 }));

  students.forEach((student) => {
    const statusByWeek: Record<string, 'PRESENT' | 'ABSENT'> = {};
    let presentCount = 0;
    let eligibleWeekCount = 0;

    weeks.forEach((week, weekIndex) => {
      const attendance = attendanceByStudentAndWeek.get(`${student.id}:${week.date}`);
      const { isMember, isPresent } = resolveWeekMembership(student, week.date, attendance);

      if (!isMember) {
        return;
      }

      eligibleWeekCount += 1;
      statusByWeek[week.date] = isPresent ? 'PRESENT' : 'ABSENT';

      if (isPresent) {
        presentCount += 1;
        weeklyPresentCounts[weekIndex].count += 1;
      }
    });

    if (eligibleWeekCount === 0) {
      return;
    }

    const activeEnrollment = (enrollmentsByStudentId.get(student.id) ?? []).find(
      (enrollment) => enrollment.schoolYear === schoolYear && enrollment.status === EnrollmentStatus.ACTIVE
    );

    rows.push({
      studentId: student.id,
      name: student.name,
      className: activeEnrollment ? (classNameById.get(activeEnrollment.classId) ?? null) : null,
      presentCount,
      eligibleWeekCount,
      attendanceRate: Math.round((presentCount / eligibleWeekCount) * 100),
      statusByWeek,
    });
  });

  rows.sort((a, b) => b.presentCount - a.presentCount || a.name.localeCompare(b.name, 'ko-KR'));

  const averageAttendanceRate =
    rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + row.attendanceRate, 0) / rows.length);

  return { weeks, rows, weeklyPresentCounts, totalStudentCount: rows.length, averageAttendanceRate };
}

/**
 * 새친구의 누적 출석 횟수를 센다(첫 방문일이 있으면 그날 이후만).
 */
export function countPresentSince(
  attendances: ReadonlyArray<AttendanceRecord>,
  studentId: string,
  sinceDate: Date | null
): number {
  return attendances.filter(
    (attendance) =>
      attendance.studentId === studentId &&
      attendance.status === AttendanceStatus.PRESENT &&
      (sinceDate === null || attendance.attendanceDate >= sinceDate)
  ).length;
}
