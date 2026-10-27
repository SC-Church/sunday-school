import type { Metadata } from 'next';

import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { getStoreSnapshot } from '@/server/db/repository';
import { TEACHER_APPROVAL_STATUS, TEACHER_ROLE } from '@/types/teacher';
import { getSchoolYearInKst } from '@/utils/grade';

import TeachersView, { type TeacherRow } from './TeachersView';

export const metadata: Metadata = {
  title: '교사 정보',
};

const TEACHER_ROLE_ORDER = [TEACHER_ROLE.ADMIN, TEACHER_ROLE.TEACHER];

/**
 * 교사 목록 정렬 기준(권한 → 이름 → 이메일, 이름 없는 교사는 뒤로)을 비교한다.
 */
function compareTeachersForList(a: TeacherRow, b: TeacherRow): number {
  const roleOrder = TEACHER_ROLE_ORDER.indexOf(a.role) - TEACHER_ROLE_ORDER.indexOf(b.role);

  if (roleOrder !== 0) {
    return roleOrder;
  }
  if (a.name !== b.name) {
    if (a.name === null) {
      return 1;
    }
    if (b.name === null) {
      return -1;
    }
    return a.name.localeCompare(b.name, 'ko-KR');
  }
  return a.email.localeCompare(b.email);
}

/**
 * 교사 정보 목록 페이지를 렌더링한다.
 */
export default async function TeachersPage() {
  const session = await getServerSession(authOptions);
  const currentTeacherId = session?.user?.id;
  const isAdmin = session?.user?.role === 'ADMIN';

  const snapshot = await getStoreSnapshot();
  const schoolYear = getSchoolYearInKst();
  const departmentNameById = new Map(snapshot.departments.map((department) => [department.id, department.name]));
  // 교사별 담당 반 문자열("유년부 1반, 청소년부 중1")을 만든다.
  const assignedClassesByTeacherId = new Map<string, string[]>();
  snapshot.classes
    .filter((classRecord) => classRecord.schoolYear === schoolYear && classRecord.isActive)
    .forEach((classRecord) => {
      classRecord.teacherIds.forEach((teacherId) => {
        const labels = assignedClassesByTeacherId.get(teacherId) ?? [];
        labels.push(`${departmentNameById.get(classRecord.departmentId) ?? ''} ${classRecord.name}`.trim());
        assignedClassesByTeacherId.set(teacherId, labels);
      });
    });

  const teachers = snapshot.teachers
    .filter((teacher) => teacher.approvalStatus === TEACHER_APPROVAL_STATUS.APPROVED)
    .map<TeacherRow>((teacher) => ({
      id: teacher.id,
      email: teacher.email,
      name: teacher.name,
      phone: teacher.phone,
      birthDate: teacher.birthDate,
      grade: assignedClassesByTeacherId.get(teacher.id)?.join(', ') ?? null,
      role: teacher.role,
      isActive: teacher.isActive,
    }))
    .sort(compareTeachersForList);

  return <TeachersView teachers={teachers} canManageAll={isAdmin} currentTeacherId={currentTeacherId} />;
}
