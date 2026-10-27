import type { Metadata } from 'next';

import { getServerSession } from 'next-auth';

import { type ClassScope, parseClassScope } from '@/lib/attendance-display';
import { authOptions } from '@/lib/auth';
import { buildClassGroups } from '@/server/attendance/service';
import { getStoreSnapshot, withGuardians } from '@/server/db/repository';
import { EnrollmentStatus } from '@/types/domain';
import { getSchoolYearInKst } from '@/utils/grade';

import StudentsResultToast from './StudentsResultToast';
import StudentsView, { type StudentInput } from './StudentsView';
import TalentResetButton from './TalentResetButton';

export const metadata: Metadata = {
  title: '학생 관리',
};

type StudentsPageProps = {
  searchParams?: Promise<{
    class_id?: string | string[];
  }>;
};

/**
 * 학생 관리 페이지를 렌더링한다. class_id가 없으면 전체(부서·반별 묶음)를 보여준다.
 */
export default async function StudentsPage({ searchParams }: StudentsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === 'ADMIN';
  const selectedScope: ClassScope = parseClassScope(resolvedSearchParams?.class_id) ?? { kind: 'all' };
  const snapshot = await getStoreSnapshot();
  const schoolYear = getSchoolYearInKst();
  const classGroups = buildClassGroups(snapshot, schoolYear, session?.user?.id ?? null);
  const classById = new Map(snapshot.classes.map((classRecord) => [classRecord.id, classRecord]));
  const departmentNameById = new Map(snapshot.departments.map((department) => [department.id, department.name]));
  const activeClassIdByStudentId = new Map(
    snapshot.enrollments
      .filter((enrollment) => enrollment.schoolYear === schoolYear && enrollment.status === EnrollmentStatus.ACTIVE)
      .map((enrollment) => [enrollment.studentId, enrollment.classId])
  );

  const students = withGuardians(snapshot).map<StudentInput>((student) => {
    const classId = activeClassIdByStudentId.get(student.id) ?? null;
    const classRecord = classId ? classById.get(classId) : undefined;

    return {
      id: student.id,
      name: student.name,
      gender: student.gender,
      birthDate: student.birthDate,
      address: student.address,
      phone: student.phone,
      currentTalent: student.currentTalent,
      guardianContact: student.guardianContact,
      classId: classRecord?.id ?? null,
      className: classRecord?.name ?? null,
      departmentName: classRecord ? (departmentNameById.get(classRecord.departmentId) ?? null) : null,
      isNewFriend: student.isNewFriend,
      note: student.note,
    };
  });

  return (
    <>
      <StudentsResultToast />
      <StudentsView
        students={students}
        classGroups={classGroups.map((group) => ({
          departmentId: group.departmentId,
          departmentName: group.departmentName,
          classes: group.classes.map(({ id, name, studentCount }) => ({ id, name, studentCount })),
        }))}
        selectedScope={selectedScope}
        schoolYear={schoolYear}
        isAdmin={isAdmin}
        canManage
        basePath="/students"
        talentResetSlot={<TalentResetButton />}
      />
    </>
  );
}
