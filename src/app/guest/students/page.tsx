import type { Metadata } from 'next';

import StudentsView from '@/app/students/StudentsView';
import { type ClassScope, parseClassScope } from '@/lib/attendance-display';
import { getGuestClassGroups, getGuestStudents } from '@/server/guest/demo-data';
import { getSchoolYearInKst } from '@/utils/grade';

export const metadata: Metadata = {
  title: '게스트 학생 관리',
};

type GuestStudentsPageProps = {
  searchParams?: Promise<{
    class_id?: string | string[];
  }>;
};

/**
 * 데모 데이터로 학생 관리 화면을 렌더링한다.
 * 저장소를 조회하지 않으며 등록·수정·출석부 같은 쓰기 진입점은 노출하지 않는다.
 */
export default async function GuestStudentsPage({ searchParams }: GuestStudentsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedScope: ClassScope = parseClassScope(resolvedSearchParams?.class_id) ?? { kind: 'all' };

  return (
    <StudentsView
      students={getGuestStudents()}
      classGroups={getGuestClassGroups()}
      selectedScope={selectedScope}
      schoolYear={getSchoolYearInKst()}
      isAdmin={false}
      canManage={false}
      basePath="/guest/students"
    />
  );
}
