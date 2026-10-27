import type { Metadata } from 'next';

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { TEACHER_ROLE } from '@/types/teacher';
import { getSchoolYearInKst } from '@/utils/grade';

import StudentImportClient from './StudentImportClient';

export const metadata: Metadata = {
  title: '학생 일괄 등록',
};

/**
 * CSV 학생 일괄 등록 페이지를 렌더링한다. 관리자 전용.
 */
export default async function StudentImportPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== TEACHER_ROLE.ADMIN) {
    redirect('/students');
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6">
      <section className="mx-auto w-full max-w-5xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">학생 일괄 등록 (CSV)</h1>
          <Link href="/students" prefetch={false} className="btn btn-secondary btn-md">
            목록으로
          </Link>
        </div>
        <StudentImportClient defaultSchoolYear={getSchoolYearInKst()} />
      </section>
    </main>
  );
}
