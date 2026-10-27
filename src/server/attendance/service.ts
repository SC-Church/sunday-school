import { type ClassScope } from '@/lib/attendance-display';
import { sortStudentsByGradeDescThenName } from '@/lib/student-sort';
import { getWeeklyCalendarSummary } from '@/server/calendar/google-calendar';
import {
  type StoreSnapshot,
  adjustStudentTalent,
  findActiveEnrollment,
  getStoreSnapshot,
  setAttendanceStatusIfExpected,
} from '@/server/db/repository';
import type { ClassRecord, DepartmentRecord, EnrollmentRecord } from '@/server/db/sheet-schema';
import { AttendanceStatus, EnrollmentStatus, type Gender, TalentTransactionReason } from '@/types/domain';
import {
  addWeeksToSunday,
  formatDateToKoreanYmd,
  getKoreanWeekdayIndex,
  getLastSundayOfMonthKst,
  getSundayOfWeekInKst,
} from '@/utils/date';
import { type StudentGradeLabel, getGradeLabelByBirthDateInKst, getSchoolYearInKst } from '@/utils/grade';

import { countPresentSince } from './stats';

const TALENT_LOG_LIMIT = 40;
/** 새친구가 이 횟수 이상 출석하면 정착 후보로 표시한다. */
export const NEW_FRIEND_SETTLE_THRESHOLD = 4;

export const TALENT_ADJUST_VALUES = new Set(['3', '2', '1', '-1']);

export type StudentRow = {
  id: string;
  name: string;
  gender: Gender;
  birthDate: Date;
  currentTalent: number;
  weeklyExtraTalent: number;
  gradeLabel: StudentGradeLabel;
  attendanceStatus: AttendanceStatus;
  className: string | null;
  isNewFriend: boolean;
};

export type TalentLogRow = {
  id: string;
  amount: number;
  transactedAt: Date;
  student: {
    name: string;
  };
  teacher: {
    name: string | null;
    email: string;
  } | null;
};

export type NewFriendRow = {
  id: string;
  name: string;
  className: string | null;
  firstVisitDate: Date | null;
  presentCount: number;
};

export type ClassOption = {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  /** 현재 로그인한 교사가 담당하는 반인지 */
  isMine: boolean;
  studentCount: number;
};

export type ClassOptionGroup = {
  departmentId: string;
  departmentName: string;
  classes: ClassOption[];
};

type BirthdayStudentRow = {
  id: string;
  name: string;
  birthDate: Date;
  gradeLabel: StudentGradeLabel;
};

type AttendancePageData = {
  attendanceDate: Date;
  nextSundayDate: Date;
  currentQuarter: 1 | 2 | 3 | 4;
  shouldShowBirthdayPartyBanner: boolean;
  quarterlyBirthdayStudents: Array<{ id: string; name: string; gradeLabel: StudentGradeLabel }>;
  thisMonthTeacherBirthdays: Array<{ id: string; displayName: string }>;
  nextMonthTeacherBirthdays: Array<{ id: string; displayName: string }>;
  todayPresentCount: number;
  weeklyTrend: Array<{ label: string; count: number }>;
  currentWeekCalendarSummary: CalendarSummary | null;
  nextWeekCalendarSummary: CalendarSummary | null;
};

type CalendarSummary = {
  title: string;
  worshipDate: string | null;
  socialLeader: string | null;
  pulpitLeader: string | null;
  weeklySchedules: string[];
};

export type AttendanceInteractiveData = {
  scope: ClassScope;
  schoolYear: number;
  classGroups: ClassOptionGroup[];
  unassignedCount: number;
  studentsForTable: StudentRow[];
  newFriends: NewFriendRow[];
  talentLogs: TalentLogRow[];
};

/**
 * 출석 기준 주(이번 주 일요일)와 다음 일요일을 반환한다.
 */
export function getAttendancePeriodInfo(baseDate: Date = new Date()): {
  attendanceDate: Date;
  nextSundayDate: Date;
} {
  const attendanceDate = getSundayOfWeekInKst(baseDate);
  return { attendanceDate, nextSundayDate: addWeeksToSunday(attendanceDate, 1) };
}

/**
 * 학년도의 활성 반을 부서 순서·반 순서대로 묶어 선택지로 만든다.
 */
export function buildClassGroups(
  snapshot: Pick<StoreSnapshot, 'departments' | 'classes' | 'enrollments'>,
  schoolYear: number,
  teacherId: string | null
): ClassOptionGroup[] {
  const activeEnrollmentCountByClassId = new Map<string, number>();
  snapshot.enrollments.forEach((enrollment) => {
    if (enrollment.schoolYear === schoolYear && enrollment.status === EnrollmentStatus.ACTIVE) {
      activeEnrollmentCountByClassId.set(
        enrollment.classId,
        (activeEnrollmentCountByClassId.get(enrollment.classId) ?? 0) + 1
      );
    }
  });

  return snapshot.departments
    .filter((department) => department.isActive)
    .map((department) => ({
      departmentId: department.id,
      departmentName: department.name,
      classes: snapshot.classes
        .filter(
          (classRecord) =>
            classRecord.departmentId === department.id && classRecord.schoolYear === schoolYear && classRecord.isActive
        )
        .map((classRecord) => ({
          id: classRecord.id,
          name: classRecord.name,
          departmentId: department.id,
          departmentName: department.name,
          isMine: teacherId !== null && classRecord.teacherIds.includes(teacherId),
          studentCount: activeEnrollmentCountByClassId.get(classRecord.id) ?? 0,
        })),
    }))
    .filter((group) => group.classes.length > 0);
}

/**
 * 범위가 지정되지 않았을 때의 기본 범위: 내 반 → 첫 반 → 전체.
 */
export function resolveDefaultClassScope(classGroups: ClassOptionGroup[]): ClassScope {
  const allClasses = classGroups.flatMap((group) => group.classes);
  const preferred = allClasses.find((classOption) => classOption.isMine) ?? allClasses[0];

  return preferred ? { kind: 'class', classId: preferred.id } : { kind: 'all' };
}

/**
 * 학생 id → 현재 학년도 반 이름 맵을 만든다.
 */
function buildClassNameByStudentId(
  enrollments: ReadonlyArray<EnrollmentRecord>,
  classes: ReadonlyArray<ClassRecord>,
  departments: ReadonlyArray<DepartmentRecord>,
  schoolYear: number
): Map<string, { classId: string; className: string; departmentName: string }> {
  const classById = new Map(classes.map((classRecord) => [classRecord.id, classRecord]));
  const departmentNameById = new Map(departments.map((department) => [department.id, department.name]));
  const result = new Map<string, { classId: string; className: string; departmentName: string }>();

  enrollments.forEach((enrollment) => {
    if (enrollment.schoolYear !== schoolYear || enrollment.status !== EnrollmentStatus.ACTIVE) {
      return;
    }
    const classRecord = classById.get(enrollment.classId);
    if (classRecord) {
      result.set(enrollment.studentId, {
        classId: classRecord.id,
        className: classRecord.name,
        departmentName: departmentNameById.get(classRecord.departmentId) ?? '',
      });
    }
  });

  return result;
}

/**
 * 대시보드용 데이터(생일, 주간 추이, 주간 일정)를 만든다. 전체 학생이 대상이다.
 */
export async function getAttendancePageData(): Promise<AttendancePageData> {
  const snapshot = await getStoreSnapshot();
  const { attendanceDate, nextSundayDate } = getAttendancePeriodInfo();
  const todayKstYmd = formatDateToKoreanYmd(new Date());
  const currentQuarter = getCurrentQuarterByLastSunday(attendanceDate);
  const [quarterStartMonth, quarterEndMonth] = getQuarterMonthRange(currentQuarter);
  const quarterEndSunday = getLastSundayOfMonthKst(Number(todayKstYmd.slice(0, 4)), getQuarterEndMonth(currentQuarter));
  const shouldShowBirthdayPartyBanner = quarterEndSunday >= attendanceDate && quarterEndSunday < nextSundayDate;
  const thisMonth = Number(formatDateToKoreanYmd(attendanceDate).slice(5, 7));
  const nextMonth = thisMonth === 12 ? 1 : thisMonth + 1;

  const quarterlyBirthdayStudents = sortStudentsByGradeDescThenName<BirthdayStudentRow>(
    snapshot.students
      .map((student) => ({
        id: student.id,
        name: student.name,
        birthDate: student.birthDate,
        gradeLabel: getGradeLabelByBirthDateInKst(student.birthDate),
      }))
      .filter((student) => {
        const birthMonth = Number(formatDateToKoreanYmd(student.birthDate).slice(5, 7));
        return birthMonth >= quarterStartMonth && birthMonth <= quarterEndMonth;
      })
  );

  const teacherBirthdays = snapshot.teachers
    .filter((teacher) => teacher.approvalStatus === 'APPROVED' && teacher.birthDate !== null)
    .sort(compareTeachersByNameNullsLast);
  const getBirthMonth = (birthDate: Date | null) =>
    birthDate ? Number(formatDateToKoreanYmd(birthDate).slice(5, 7)) : 0;
  const thisMonthTeacherBirthdays = teacherBirthdays.filter(
    (teacher) => getBirthMonth(teacher.birthDate) === thisMonth
  );
  const nextMonthTeacherBirthdays = teacherBirthdays.filter(
    (teacher) => getBirthMonth(teacher.birthDate) === nextMonth
  );

  const todayPresentCount = snapshot.attendances.filter(
    (row) => row.attendanceDate.getTime() === attendanceDate.getTime() && row.status === AttendanceStatus.PRESENT
  ).length;

  const weeklyTrendDates = Array.from({ length: 13 }, (_, index) => addWeeksToSunday(attendanceDate, index - 12));
  const weeklyPresentCountByDate = new Map<string, number>();
  snapshot.attendances.forEach((row) => {
    if (
      row.status === AttendanceStatus.PRESENT &&
      row.attendanceDate >= weeklyTrendDates[0] &&
      row.attendanceDate <= attendanceDate
    ) {
      const dateKey = formatDateToKoreanYmd(row.attendanceDate);
      weeklyPresentCountByDate.set(dateKey, (weeklyPresentCountByDate.get(dateKey) ?? 0) + 1);
    }
  });
  const weeklyTrend = weeklyTrendDates.map((targetSunday) => ({
    label: formatDateToKoreanYmd(targetSunday).slice(5),
    count: weeklyPresentCountByDate.get(formatDateToKoreanYmd(targetSunday)) ?? 0,
  }));

  const worshipWeekSundayDate = getWorshipWeekSundayKstDate();
  const nextWorshipWeekSundayDate = addWeeksToSunday(worshipWeekSundayDate, 1);
  const thirdWorshipWeekSundayDate = addWeeksToSunday(nextWorshipWeekSundayDate, 1);
  const [currentWeekCalendarSummary, nextWeekCalendarSummary] = await Promise.all([
    getWeeklyCalendarSummary(worshipWeekSundayDate, nextWorshipWeekSundayDate),
    getWeeklyCalendarSummary(nextWorshipWeekSundayDate, thirdWorshipWeekSundayDate),
  ]);

  return {
    attendanceDate,
    nextSundayDate,
    currentQuarter,
    shouldShowBirthdayPartyBanner,
    quarterlyBirthdayStudents: quarterlyBirthdayStudents.map(({ id, name, gradeLabel }) => ({ id, name, gradeLabel })),
    thisMonthTeacherBirthdays: thisMonthTeacherBirthdays.map((teacher) => ({
      id: teacher.id,
      displayName: teacher.name ?? teacher.email,
    })),
    nextMonthTeacherBirthdays: nextMonthTeacherBirthdays.map((teacher) => ({
      id: teacher.id,
      displayName: teacher.name ?? teacher.email,
    })),
    todayPresentCount,
    weeklyTrend,
    currentWeekCalendarSummary,
    nextWeekCalendarSummary,
  };
}

/**
 * 출석 관리 화면 데이터를 만든다. 범위가 없으면 교사의 담당 반을 기본으로 고른다.
 */
export async function getAttendanceInteractiveData(
  requestedScope: ClassScope | null,
  teacherId: string | null
): Promise<AttendanceInteractiveData> {
  const snapshot = await getStoreSnapshot();
  const { attendanceDate, nextSundayDate } = getAttendancePeriodInfo();
  const schoolYear = getSchoolYearInKst();
  const classGroups = buildClassGroups(snapshot, schoolYear, teacherId);
  const scope = requestedScope ?? resolveDefaultClassScope(classGroups);
  const classInfoByStudentId = buildClassNameByStudentId(
    snapshot.enrollments,
    snapshot.classes,
    snapshot.departments,
    schoolYear
  );
  const attendanceStatusByStudentId = new Map(
    snapshot.attendances
      .filter((row) => row.attendanceDate.getTime() === attendanceDate.getTime())
      .map((row) => [row.studentId, row.status])
  );
  const weeklyManualTalentByStudentId = new Map<string, number>();
  snapshot.talentTransactions.forEach((row) => {
    if (
      row.reason === TalentTransactionReason.MANUAL_ADJUST &&
      row.transactedAt >= attendanceDate &&
      row.transactedAt < nextSundayDate
    ) {
      weeklyManualTalentByStudentId.set(
        row.studentId,
        (weeklyManualTalentByStudentId.get(row.studentId) ?? 0) + row.amount
      );
    }
  });

  const isInScope = (studentId: string): boolean => {
    const classInfo = classInfoByStudentId.get(studentId);

    if (scope.kind === 'all') {
      return true;
    }
    if (scope.kind === 'unassigned') {
      return !classInfo;
    }
    return classInfo?.classId === scope.classId;
  };

  const studentsForTable = sortStudentsByGradeDescThenName(
    snapshot.students
      .filter((student) => isInScope(student.id))
      .map<StudentRow>((student) => ({
        id: student.id,
        name: student.name,
        gender: student.gender,
        birthDate: student.birthDate,
        currentTalent: student.currentTalent,
        weeklyExtraTalent: weeklyManualTalentByStudentId.get(student.id) ?? 0,
        gradeLabel: getGradeLabelByBirthDateInKst(student.birthDate),
        attendanceStatus: attendanceStatusByStudentId.get(student.id) ?? AttendanceStatus.ABSENT,
        className: classInfoByStudentId.get(student.id)?.className ?? null,
        isNewFriend: student.isNewFriend,
      }))
  );

  const newFriends = snapshot.students
    .filter((student) => student.isNewFriend && isInScope(student.id))
    .map<NewFriendRow>((student) => ({
      id: student.id,
      name: student.name,
      className: classInfoByStudentId.get(student.id)?.className ?? null,
      firstVisitDate: student.firstVisitDate,
      presentCount: countPresentSince(snapshot.attendances, student.id, student.firstVisitDate),
    }))
    .sort((a, b) => b.presentCount - a.presentCount || a.name.localeCompare(b.name, 'ko-KR'));

  const unassignedCount = snapshot.students.filter((student) => !classInfoByStudentId.has(student.id)).length;

  return {
    scope,
    schoolYear,
    classGroups,
    unassignedCount,
    studentsForTable,
    newFriends,
    talentLogs: getWeeklyTalentLogs(snapshot, attendanceDate, nextSundayDate),
  };
}

/**
 * 수동 달란트 조정을 반영한다.
 */
export async function updateStudentTalent(
  studentId: string,
  amount: number,
  teacherId: string,
  attendanceDate: Date,
  nextSundayDate: Date
): Promise<{
  studentId: string;
  studentName: string;
  currentTalent: number;
  weeklyExtraTalent: number;
  transaction: { id: string; amount: number; transactedAt: Date };
}> {
  const updatedResult = await adjustStudentTalent({
    studentId,
    amount,
    teacherId,
    weekStartDate: attendanceDate,
    nextWeekStartDate: nextSundayDate,
  });

  return {
    studentId: updatedResult.student.id,
    studentName: updatedResult.student.name,
    currentTalent: updatedResult.student.currentTalent,
    weeklyExtraTalent: updatedResult.weeklyExtraTalent,
    transaction: {
      id: updatedResult.transaction.id,
      amount: updatedResult.transaction.amount,
      transactedAt: updatedResult.transaction.transactedAt,
    },
  };
}

/**
 * 기대 상태가 맞을 때만 출석 상태를 바꾼다(다른 교사가 먼저 바꿨으면 stale_state).
 */
export function updateAttendanceWithExpectedStatus(
  studentId: string,
  attendanceDate: Date,
  expectedCurrentStatus: AttendanceStatus,
  nextStatus: AttendanceStatus,
  teacherId: string
): Promise<
  | { result: 'updated'; nextStatus: AttendanceStatus; currentTalent: number; talentDelta: number }
  | { result: 'stale_state' }
> {
  return setAttendanceStatusIfExpected({
    studentId,
    attendanceDate,
    expectedCurrentStatus,
    nextStatus,
    teacherId,
    schoolYear: getSchoolYearInKst(attendanceDate),
  });
}

/**
 * 금주 수동 달란트 조정 기록을 최신순으로 만든다. 삭제된 교사는 null로 표시한다.
 */
function getWeeklyTalentLogs(snapshot: StoreSnapshot, attendanceDate: Date, nextSundayDate: Date): TalentLogRow[] {
  const studentNameById = new Map(snapshot.students.map((student) => [student.id, student.name]));
  const teacherById = new Map(snapshot.teachers.map((teacher) => [teacher.id, teacher]));

  // 시트 행 순서는 입력 순서이므로 먼저 뒤집어, 같은 시각이면 나중에 기록한 것이 앞에 오게 한다.
  return [...snapshot.talentTransactions]
    .reverse()
    .filter(
      (row) =>
        row.reason === TalentTransactionReason.MANUAL_ADJUST &&
        row.transactedAt >= attendanceDate &&
        row.transactedAt < nextSundayDate &&
        studentNameById.has(row.studentId)
    )
    .sort((a, b) => b.transactedAt.getTime() - a.transactedAt.getTime())
    .slice(0, TALENT_LOG_LIMIT)
    .map((row) => {
      const teacher = row.teacherId ? teacherById.get(row.teacherId) : undefined;

      return {
        id: row.id,
        amount: row.amount,
        transactedAt: row.transactedAt,
        student: { name: studentNameById.get(row.studentId) ?? '' },
        teacher: teacher ? { name: teacher.name, email: teacher.email } : null,
      };
    });
}

/**
 * 이름 오름차순, 이름 없는 교사는 뒤로 보내는 비교 함수.
 */
function compareTeachersByNameNullsLast(a: { name: string | null }, b: { name: string | null }): number {
  if (a.name === b.name) {
    return 0;
  }
  if (a.name === null) {
    return 1;
  }
  if (b.name === null) {
    return -1;
  }
  return a.name.localeCompare(b.name, 'ko-KR');
}

/**
 * 예배 일정 기준 일요일을 반환한다. 일요일은 당일을, 월~토는 다음 일요일을 기준으로 사용한다.
 */
function getWorshipWeekSundayKstDate(baseDate: Date = new Date()): Date {
  const currentSunday = getSundayOfWeekInKst(baseDate);
  return getKoreanWeekdayIndex(baseDate) === 0 ? currentSunday : addWeeksToSunday(currentSunday, 1);
}

/**
 * 분기 마지막 일요일 기준으로 현재 분기를 정한다.
 */
function getCurrentQuarterByLastSunday(today: Date): 1 | 2 | 3 | 4 {
  const currentYear = Number(formatDateToKoreanYmd(today).slice(0, 4));
  const quarterEndMonths = [3, 6, 9, 12] as const;

  for (let index = 0; index < quarterEndMonths.length; index += 1) {
    if (today <= getLastSundayOfMonthKst(currentYear, quarterEndMonths[index])) {
      return (index + 1) as 1 | 2 | 3 | 4;
    }
  }

  return 4;
}

/**
 * 분기의 시작·끝 월을 반환한다.
 */
function getQuarterMonthRange(quarter: 1 | 2 | 3 | 4): [number, number] {
  return [
    [1, 3],
    [4, 6],
    [7, 9],
    [10, 12],
  ][quarter - 1] as [number, number];
}

/**
 * 분기의 끝 월을 반환한다.
 */
function getQuarterEndMonth(quarter: 1 | 2 | 3 | 4): 3 | 6 | 9 | 12 {
  return ([3, 6, 9, 12] as const)[quarter - 1];
}

/**
 * 학생이 현재 학년도에 배정된 반 id를 반환한다(없으면 null).
 */
export function getStudentClassId(
  snapshot: Pick<StoreSnapshot, 'enrollments'>,
  studentId: string,
  schoolYear: number
): string | null {
  return (
    findActiveEnrollment(
      snapshot.enrollments.map((record) => ({ record })),
      studentId,
      schoolYear
    )?.record.classId ?? null
  );
}
