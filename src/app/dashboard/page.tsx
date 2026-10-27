import type { Metadata } from 'next';

import { getAttendancePageData } from '@/server/attendance/service';

import AttendanceDashboard from '../attendance/AttendanceDashboard';

export const metadata: Metadata = {
  title: '대시보드',
};

/**
 * 대시보드 페이지를 렌더링한다.
 */
export default async function DashboardPage() {
  const attendancePageData = await getAttendancePageData();

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-8 sm:px-6">
      <AttendanceDashboard
        currentQuarter={attendancePageData.currentQuarter}
        shouldShowBirthdayPartyBanner={attendancePageData.shouldShowBirthdayPartyBanner}
        quarterlyBirthdayStudents={attendancePageData.quarterlyBirthdayStudents}
        thisMonthTeacherBirthdays={attendancePageData.thisMonthTeacherBirthdays}
        nextMonthTeacherBirthdays={attendancePageData.nextMonthTeacherBirthdays}
        todayPresentCount={attendancePageData.todayPresentCount}
        weeklyTrend={attendancePageData.weeklyTrend}
        currentWeekCalendarSummary={attendancePageData.currentWeekCalendarSummary}
        nextWeekCalendarSummary={attendancePageData.nextWeekCalendarSummary}
      />
    </main>
  );
}
