import type { Metadata } from 'next';

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { getStoreSnapshot } from '@/server/db/repository';
import { formatDateToKoreanYmd } from '@/utils/date';
import { getSchoolYearInKst } from '@/utils/grade';

import PasswordChangeForm from './PasswordChangeForm';
import TeacherEditForm from './TeacherEditForm';

export const metadata: Metadata = {
  title: '교사 수정',
};

type TeacherEditPageProps = {
  params: Promise<{
    teacher_id: string;
  }>;
};

/**
 * 교사 정보 수정 페이지를 렌더링한다.
 */
export default async function TeacherEditPage({ params }: TeacherEditPageProps) {
  const session = await getServerSession(authOptions);
  const { teacher_id: teacherId } = await params;
  const isAdmin = session?.user?.role === 'ADMIN';
  const isSelf = session?.user?.id === teacherId;

  if (!session?.user?.id) {
    redirect('/login');
  }

  if (!isAdmin && !isSelf) {
    redirect('/teachers');
  }

  const snapshot = await getStoreSnapshot();
  const teacher = snapshot.teachers.find((candidate) => candidate.id === teacherId) ?? null;
  const departmentNameById = new Map(snapshot.departments.map((department) => [department.id, department.name]));
  const assignedClassesText = snapshot.classes
    .filter(
      (classRecord) =>
        classRecord.schoolYear === getSchoolYearInKst() &&
        classRecord.isActive &&
        classRecord.teacherIds.includes(teacherId)
    )
    .map((classRecord) => `${departmentNameById.get(classRecord.departmentId) ?? ''} ${classRecord.name}`.trim())
    .join(', ');

  if (!teacher) {
    redirect('/teachers');
  }

  const initialValues = {
    name: teacher.name ?? '',
    phone: teacher.phone ?? '',
    birth_date: teacher.birthDate ? formatDateToKoreanYmd(teacher.birthDate) : '',
    is_active: teacher.isActive,
  };

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6">
      <section className="mx-auto w-full max-w-4xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">교사 정보 수정</h1>
          <Link href="/teachers" prefetch={false} className="btn btn-secondary btn-md">
            목록으로
          </Link>
        </div>

        <TeacherEditForm
          teacherId={teacherId}
          email={teacher.email}
          isAdmin={isAdmin}
          initialValues={initialValues}
          assignedClassesText={assignedClassesText}
        />
      </section>

      {isSelf ? (
        <section className="mx-auto mt-6 w-full max-w-4xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
          <h2 className="text-xl font-bold text-[var(--color-text)]">비밀번호 변경</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            관리자에게 임시 비밀번호를 받았다면 여기서 새 비밀번호로 바꿔 주세요.
          </p>
          <PasswordChangeForm teacherId={teacherId} />
        </section>
      ) : null}
    </main>
  );
}
