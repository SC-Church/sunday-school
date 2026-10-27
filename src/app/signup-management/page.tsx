import type { Metadata } from 'next';

import { redirect } from 'next/navigation';

import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { listTeachers } from '@/server/db/repository';
import { TEACHER_APPROVAL_STATUS, TEACHER_ROLE } from '@/types/teacher';

import SignupManagementList from './SignupManagementList';

export const metadata: Metadata = {
  title: '가입 관리',
};

/**
 * 관리자 전용 가입 관리 페이지를 렌더링한다.
 */
export default async function SignupManagementPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== TEACHER_ROLE.ADMIN) {
    redirect('/');
  }

  const teachers = await listTeachers();
  const pendingTeachers = teachers
    .filter((teacher) => teacher.approvalStatus === TEACHER_APPROVAL_STATUS.PENDING)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const processedTeachers = teachers
    .filter((teacher) => teacher.approvalStatus !== TEACHER_APPROVAL_STATUS.PENDING)
    .sort(
      (a, b) => (b.approvalProcessedAt ?? b.updatedAt).getTime() - (a.approvalProcessedAt ?? a.updatedAt).getTime()
    );

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6">
      <SignupManagementList
        currentAdminId={session.user.id ?? ''}
        initialPendingTeachers={pendingTeachers.map((teacher) => ({
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          requestedAt: teacher.createdAt.toISOString(),
        }))}
        initialProcessedTeachers={processedTeachers.map((teacher) => ({
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          approvalStatus: teacher.approvalStatus,
          role: teacher.role,
          processedAt: (teacher.approvalProcessedAt ?? teacher.updatedAt).toISOString(),
        }))}
      />
    </main>
  );
}
