import type { Metadata } from 'next';

import { redirect } from 'next/navigation';

import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { parseSchoolYearParam } from '@/lib/validation/organization';
import { getStoreSnapshot } from '@/server/db/repository';
import { EnrollmentStatus } from '@/types/domain';
import { TEACHER_ROLE } from '@/types/teacher';
import { getSchoolYearInKst } from '@/utils/grade';

import PromotionClient, { type PromotionViewModel } from './PromotionClient';

export const metadata: Metadata = {
  title: '학년 진급',
};

type PromotionPageProps = {
  searchParams?: Promise<{
    source_year?: string | string[];
    target_year?: string | string[];
  }>;
};

/**
 * 관리자 전용 학년 진급 페이지를 렌더링한다. 기본은 현재 학년도 → 다음 학년도.
 */
export default async function PromotionPage({ searchParams }: PromotionPageProps) {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== TEACHER_ROLE.ADMIN) {
    redirect('/');
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const snapshot = await getStoreSnapshot();
  const currentSchoolYear = getSchoolYearInKst();
  const sourceYear = parseSchoolYearParam(resolvedSearchParams?.source_year, currentSchoolYear);
  const targetYear = parseSchoolYearParam(resolvedSearchParams?.target_year, sourceYear + 1);
  const departmentNameById = new Map(snapshot.departments.map((department) => [department.id, department.name]));

  const toClassView = (schoolYear: number) =>
    snapshot.classes
      .filter((classRecord) => classRecord.schoolYear === schoolYear && classRecord.isActive)
      .map((classRecord) => ({
        id: classRecord.id,
        departmentId: classRecord.departmentId,
        departmentName: departmentNameById.get(classRecord.departmentId) ?? '',
        name: classRecord.name,
        sortOrder: classRecord.sortOrder,
        activeStudentCount: snapshot.enrollments.filter(
          (enrollment) =>
            enrollment.classId === classRecord.id &&
            enrollment.schoolYear === schoolYear &&
            enrollment.status === EnrollmentStatus.ACTIVE
        ).length,
      }));

  const viewModel: PromotionViewModel = {
    currentSchoolYear,
    sourceYear,
    targetYear,
    availableSchoolYears: Array.from(
      new Set([
        currentSchoolYear,
        currentSchoolYear + 1,
        ...snapshot.classes.map((classRecord) => classRecord.schoolYear),
      ])
    ).sort((a, b) => a - b),
    departments: snapshot.departments
      .filter((department) => department.isActive)
      .map((department) => ({ id: department.id, name: department.name, sortOrder: department.sortOrder })),
    sourceClasses: toClassView(sourceYear),
    targetClasses: toClassView(targetYear),
    alreadyPromotedCount: snapshot.enrollments.filter(
      (enrollment) => enrollment.schoolYear === targetYear && enrollment.status === EnrollmentStatus.ACTIVE
    ).length,
  };

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6">
      <PromotionClient viewModel={viewModel} />
    </main>
  );
}
