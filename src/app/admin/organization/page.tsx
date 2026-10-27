import type { Metadata } from 'next';

import { redirect } from 'next/navigation';

import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { parseSchoolYearParam } from '@/lib/validation/organization';
import { getStoreSnapshot } from '@/server/db/repository';
import { EnrollmentStatus } from '@/types/domain';
import { TEACHER_APPROVAL_STATUS, TEACHER_ROLE } from '@/types/teacher';
import { getSchoolYearInKst } from '@/utils/grade';

import OrganizationClient, { type OrganizationViewModel } from './OrganizationClient';

export const metadata: Metadata = {
  title: '조직 관리',
};

type OrganizationPageProps = {
  searchParams?: Promise<{
    school_year?: string | string[];
  }>;
};

/**
 * 관리자 전용 조직 관리(교회 이름·부서·반·명단) 페이지를 렌더링한다.
 */
export default async function OrganizationPage({ searchParams }: OrganizationPageProps) {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== TEACHER_ROLE.ADMIN) {
    redirect('/');
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const snapshot = await getStoreSnapshot();
  const currentSchoolYear = getSchoolYearInKst();
  const schoolYear = parseSchoolYearParam(resolvedSearchParams?.school_year, currentSchoolYear);
  const studentNameById = new Map(snapshot.students.map((student) => [student.id, student]));
  const activeEnrollments = snapshot.enrollments.filter(
    (enrollment) => enrollment.schoolYear === schoolYear && enrollment.status === EnrollmentStatus.ACTIVE
  );
  const assignedStudentIds = new Set(activeEnrollments.map((enrollment) => enrollment.studentId));

  const viewModel: OrganizationViewModel = {
    churchName: snapshot.churchName,
    schoolYear,
    currentSchoolYear,
    availableSchoolYears: Array.from(
      new Set([
        currentSchoolYear,
        currentSchoolYear + 1,
        ...snapshot.classes.map((classRecord) => classRecord.schoolYear),
      ])
    ).sort((a, b) => b - a),
    teachers: snapshot.teachers
      .filter((teacher) => teacher.approvalStatus === TEACHER_APPROVAL_STATUS.APPROVED && teacher.isActive)
      .map((teacher) => ({ id: teacher.id, name: teacher.name ?? teacher.email })),
    departments: snapshot.departments.map((department) => ({
      id: department.id,
      name: department.name,
      sortOrder: department.sortOrder,
      isActive: department.isActive,
      classCount: snapshot.classes.filter((classRecord) => classRecord.departmentId === department.id).length,
    })),
    classes: snapshot.classes
      .filter((classRecord) => classRecord.schoolYear === schoolYear)
      .map((classRecord) => ({
        id: classRecord.id,
        departmentId: classRecord.departmentId,
        name: classRecord.name,
        sortOrder: classRecord.sortOrder,
        teacherIds: classRecord.teacherIds,
        isActive: classRecord.isActive,
        hasEnrollmentHistory: snapshot.enrollments.some((enrollment) => enrollment.classId === classRecord.id),
        students: activeEnrollments
          .filter((enrollment) => enrollment.classId === classRecord.id)
          .map((enrollment) => studentNameById.get(enrollment.studentId))
          .filter((student): student is NonNullable<typeof student> => Boolean(student))
          .map((student) => ({ id: student.id, name: student.name, isNewFriend: student.isNewFriend }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR')),
      })),
    unassignedStudents: snapshot.students
      .filter((student) => !assignedStudentIds.has(student.id))
      .map((student) => ({ id: student.id, name: student.name, isNewFriend: student.isNewFriend })),
  };

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6">
      <OrganizationClient viewModel={viewModel} />
    </main>
  );
}
