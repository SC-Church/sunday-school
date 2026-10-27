import { describe, expect, it } from 'vitest';

import type { AttendanceRecord, ClassRecord, EnrollmentRecord, StudentRecord } from '@/server/db/sheet-schema';

import { buildAttendanceStats, countPresentSince, getElapsedSchoolYearWeeks, resolveAttendanceClassId } from './stats';

const kst = (ymd: string) => new Date(`${ymd}T00:00:00+09:00`);

/**
 * 테스트용 학생을 만든다.
 */
function makeStudent(id: string, name: string, firstVisitDate: Date | null = null): StudentRecord {
  return {
    id,
    name,
    gender: 'MALE',
    birthDate: kst('2016-05-10'),
    address: '',
    phone: null,
    currentTalent: 0,
    createdAt: kst('2026-03-01'),
    updatedAt: kst('2026-03-01'),
    note: null,
    isNewFriend: firstVisitDate !== null,
    firstVisitDate,
  };
}

/**
 * 테스트용 배정을 만든다.
 */
function makeEnrollment(
  studentId: string,
  classId: string,
  startedAt: string,
  endedAt: string | null = null
): EnrollmentRecord {
  return {
    id: `${studentId}-${classId}`,
    studentId,
    classId,
    schoolYear: 2026,
    status: endedAt ? 'ENDED' : 'ACTIVE',
    reason: 'MANUAL',
    startedAt: kst(startedAt),
    endedAt: endedAt ? kst(endedAt) : null,
    note: null,
    createdAt: kst(startedAt),
    updatedAt: kst(startedAt),
  };
}

/**
 * 테스트용 출석을 만든다.
 */
function makeAttendance(
  studentId: string,
  ymd: string,
  status: 'PRESENT' | 'ABSENT',
  classId: string | null = null
): AttendanceRecord {
  return {
    id: `${studentId}-${ymd}`,
    studentId,
    attendanceDate: kst(ymd),
    status,
    createdAt: kst(ymd),
    updatedAt: kst(ymd),
    classId,
  };
}

const classes: ClassRecord[] = [
  {
    id: 'c1',
    departmentId: 'd',
    schoolYear: 2026,
    name: '1반',
    sortOrder: 1,
    teacherIds: [],
    isActive: true,
    createdAt: kst('2026-03-01'),
    updatedAt: kst('2026-03-01'),
  },
  {
    id: 'c2',
    departmentId: 'd',
    schoolYear: 2026,
    name: '2반',
    sortOrder: 2,
    teacherIds: [],
    isActive: true,
    createdAt: kst('2026-03-01'),
    updatedAt: kst('2026-03-01'),
  },
];

describe('getElapsedSchoolYearWeeks', () => {
  it('기준일이 속한 주까지만 반환한다', () => {
    const weeks = getElapsedSchoolYearWeeks(2026, kst('2026-03-18'));
    expect(weeks.map((week) => week.date)).toEqual(['2026-03-01', '2026-03-08', '2026-03-15']);
    expect(weeks[0].label).toBe('03.01');
  });
});

describe('resolveAttendanceClassId', () => {
  const enrollments = [
    makeEnrollment('s1', 'c1', '2026-03-02', '2026-03-20'),
    makeEnrollment('s1', 'c2', '2026-03-20'),
  ];

  it('기록된 classId를 우선한다', () => {
    expect(resolveAttendanceClassId(makeAttendance('s1', '2026-03-29', 'PRESENT', 'c1'), enrollments, 2026)).toBe('c1');
  });

  it('classId가 없으면 그 날짜에 유효했던 배정을 쓴다', () => {
    expect(resolveAttendanceClassId(makeAttendance('s1', '2026-03-08', 'PRESENT'), enrollments, 2026)).toBe('c1');
    expect(resolveAttendanceClassId(makeAttendance('s1', '2026-03-29', 'PRESENT'), enrollments, 2026)).toBe('c2');
  });

  it('배정 전 날짜(옮긴 이전 데이터)는 학년도의 마지막 배정을 쓴다', () => {
    expect(
      resolveAttendanceClassId(
        makeAttendance('s1', '2026-03-01', 'PRESENT'),
        [makeEnrollment('s1', 'c2', '2026-09-28')],
        2026
      )
    ).toBe('c2');
    expect(resolveAttendanceClassId(makeAttendance('s1', '2026-03-01', 'PRESENT'), [], 2026)).toBeNull();
  });
});

describe('buildAttendanceStats', () => {
  const students = [makeStudent('s1', '김철수'), makeStudent('s2', '이영희'), makeStudent('s3', '박미배정')];
  const enrollments = [
    makeEnrollment('s1', 'c1', '2026-03-01'),
    makeEnrollment('s2', 'c1', '2026-03-01', '2026-03-10'),
    makeEnrollment('s2', 'c2', '2026-03-10'),
  ];
  const attendances = [
    makeAttendance('s1', '2026-03-01', 'PRESENT', 'c1'),
    makeAttendance('s1', '2026-03-08', 'ABSENT', 'c1'),
    makeAttendance('s1', '2026-03-15', 'PRESENT', 'c1'),
    makeAttendance('s2', '2026-03-01', 'PRESENT'),
    makeAttendance('s2', '2026-03-15', 'PRESENT', 'c2'),
  ];
  const baseDate = kst('2026-03-18');

  it('반 범위: 그 반에 소속됐던 주만 집계하고 출석률을 계산한다', () => {
    const stats = buildAttendanceStats({
      schoolYear: 2026,
      scope: { kind: 'class', classId: 'c1' },
      students,
      enrollments,
      attendances,
      classes,
      baseDate,
    });

    expect(stats.weeks).toHaveLength(3);
    const kim = stats.rows.find((row) => row.studentId === 's1')!;
    expect(kim).toMatchObject({ presentCount: 2, eligibleWeekCount: 3, attendanceRate: 67, className: '1반' });
    expect(kim.statusByWeek).toEqual({ '2026-03-01': 'PRESENT', '2026-03-08': 'ABSENT', '2026-03-15': 'PRESENT' });

    // 이영희는 3/10에 2반으로 옮겼으므로 1반에서는 3/1(와 3/8)만 집계된다
    const lee = stats.rows.find((row) => row.studentId === 's2')!;
    expect(lee.statusByWeek).toEqual({ '2026-03-01': 'PRESENT', '2026-03-08': 'ABSENT' });
    expect(lee.className).toBe('2반');
    expect(stats.rows.some((row) => row.studentId === 's3')).toBe(false);
    expect(stats.weeklyPresentCounts.map((week) => week.count)).toEqual([2, 0, 1]);
    expect(stats.totalStudentCount).toBe(2);
  });

  it('전체 범위: 배정이나 출석이 있는 학생을 첫 소속 주부터 집계한다', () => {
    const stats = buildAttendanceStats({
      schoolYear: 2026,
      scope: { kind: 'all' },
      students,
      enrollments,
      attendances,
      classes,
      baseDate,
    });

    expect(stats.rows.map((row) => row.studentId).sort()).toEqual(['s1', 's2']);
    expect(stats.rows.find((row) => row.studentId === 's2')).toMatchObject({ presentCount: 2, eligibleWeekCount: 3 });
    expect(stats.weeklyPresentCounts.map((week) => week.count)).toEqual([2, 0, 2]);
  });

  it('출석 많은 순, 같으면 이름순으로 정렬하고 평균 출석률을 낸다', () => {
    const stats = buildAttendanceStats({
      schoolYear: 2026,
      scope: { kind: 'all' },
      students,
      enrollments,
      attendances,
      classes,
      baseDate,
    });
    expect(stats.rows.map((row) => row.name)).toEqual(['김철수', '이영희']);
    expect(stats.averageAttendanceRate).toBe(67);
  });
});

describe('countPresentSince', () => {
  it('첫 방문일 이후의 출석만 센다', () => {
    const attendances = [
      makeAttendance('s1', '2026-03-01', 'PRESENT'),
      makeAttendance('s1', '2026-03-08', 'ABSENT'),
      makeAttendance('s1', '2026-03-15', 'PRESENT'),
      makeAttendance('s2', '2026-03-15', 'PRESENT'),
    ];
    expect(countPresentSince(attendances, 's1', null)).toBe(2);
    expect(countPresentSince(attendances, 's1', kst('2026-03-08'))).toBe(1);
  });
});
