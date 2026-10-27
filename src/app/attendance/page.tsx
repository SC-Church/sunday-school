import type { Metadata } from 'next';

import { getServerSession } from 'next-auth';

import { parseClassScope } from '@/lib/attendance-display';
import { authOptions } from '@/lib/auth';
import { serializeInteractiveData } from '@/server/attendance/serialize';
import { getAttendanceInteractiveData, getAttendancePeriodInfo } from '@/server/attendance/service';
import { formatDateToKoreanYmd } from '@/utils/date';

import AttendanceInteractiveSection from './AttendanceInteractiveSection';
import AttendanceResultToast from './AttendanceResultToast';

export const metadata: Metadata = {
  title: '출석 관리',
};

type AttendancePageProps = {
  searchParams?: Promise<{
    class_id?: string | string[];
  }>;
};

/**
 * 반 단위 출석 관리 페이지를 렌더링한다. class_id가 없으면 교사의 담당 반이 기본이다.
 */
export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getServerSession(authOptions);
  const requestedScope = parseClassScope(resolvedSearchParams?.class_id);
  const { attendanceDate, nextSundayDate } = getAttendancePeriodInfo();
  const interactiveData = await getAttendanceInteractiveData(requestedScope, session?.user?.id ?? null);

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-8 sm:px-6">
      <AttendanceResultToast />

      <AttendanceInteractiveSection
        attendanceDateText={formatDateToKoreanYmd(attendanceDate)}
        nextSundayDateText={formatDateToKoreanYmd(nextSundayDate)}
        initialData={serializeInteractiveData(interactiveData)}
      />
    </main>
  );
}
