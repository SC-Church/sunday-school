import { NextResponse } from 'next/server';

import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { findStudentAttendances } from '@/server/db/repository';
import { AttendanceStatus } from '@/types/domain';
import { TEACHER_APPROVAL_STATUS } from '@/types/teacher';
import { formatDateToKoreanYmd } from '@/utils/date';

const KOREAN_WEEKDAY_INDEX_BY_SHORT_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type RouteContext = {
  params: Promise<{
    student_id: string;
  }>;
};

/**
 * 한국 시간 기준 요일 인덱스(일=0)를 반환한다.
 */
function getKoreanWeekdayIndex(date: Date): number {
  const shortWeekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).format(date);

  return KOREAN_WEEKDAY_INDEX_BY_SHORT_NAME[shortWeekdayName] ?? 0;
}

/**
 * 특정 연/월의 첫 번째 일요일(00:00, KST 기준)을 반환한다.
 */
function getFirstSundayOfMonthKst(year: number, month: number): Date {
  const firstDay = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+09:00`);
  const firstDayWeekIndex = getKoreanWeekdayIndex(firstDay);

  if (firstDayWeekIndex === 0) {
    return firstDay;
  }

  const firstSunday = new Date(firstDay);
  firstSunday.setUTCDate(firstSunday.getUTCDate() + (7 - firstDayWeekIndex));
  return firstSunday;
}

/**
 * 특정 연/월의 마지막 일요일(00:00, KST 기준)을 반환한다.
 */
function getLastSundayOfMonthKst(year: number, month: number): Date {
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0));
  const weekdayIndex = getKoreanWeekdayIndex(lastDayOfMonth);
  const lastSunday = new Date(lastDayOfMonth);
  lastSunday.setUTCDate(lastSunday.getUTCDate() - weekdayIndex);
  return lastSunday;
}

/**
 * 시작/종료 일요일 사이의 주차 목록(양 끝 포함)을 반환한다.
 */
function getSundaySeriesBetween(startSunday: Date, endSunday: Date): Date[] {
  const result: Date[] = [];
  const cursor = new Date(startSunday);

  while (cursor <= endSunday) {
    result.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return result;
}

/**
 * 학생별 학사연도 출석부 데이터를 반환한다.
 */
export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || session.user.approvalStatus !== TEACHER_APPROVAL_STATUS.APPROVED) {
    return NextResponse.json({ message: 'forbidden' }, { status: 403 });
  }

  const { student_id: studentId } = await context.params;

  if (!studentId) {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  const studentAttendances = await findStudentAttendances(studentId);

  if (!studentAttendances) {
    return NextResponse.json({ message: 'not_found' }, { status: 404 });
  }

  const todayYmd = formatDateToKoreanYmd(new Date());
  const currentYear = Number(todayYmd.slice(0, 4));
  const currentMonth = Number(todayYmd.slice(5, 7));
  const schoolYearStart = currentMonth >= 3 ? currentYear : currentYear - 1;
  const schoolYearEnd = schoolYearStart + 1;
  const firstSunday = getFirstSundayOfMonthKst(schoolYearStart, 3);
  const lastSunday = getLastSundayOfMonthKst(schoolYearEnd, 2);
  const weeks = getSundaySeriesBetween(firstSunday, lastSunday).map((weekDate) => {
    const ymd = formatDateToKoreanYmd(weekDate);

    return {
      date: ymd,
      label: ymd.slice(5).replace('-', '.'),
    };
  });

  const attendanceRows = studentAttendances.attendances.filter(
    (attendance) => attendance.attendanceDate >= firstSunday && attendance.attendanceDate <= lastSunday
  );

  const statusByDate = new Map(
    attendanceRows.map((attendance) => [formatDateToKoreanYmd(attendance.attendanceDate), attendance.status])
  );

  const statuses = Object.fromEntries(
    weeks.map((week) => [week.date, statusByDate.get(week.date) ?? AttendanceStatus.ABSENT])
  );

  return NextResponse.json({
    studentName: studentAttendances.student.name,
    schoolYearStart,
    schoolYearEnd,
    weeks,
    statuses,
  });
}
