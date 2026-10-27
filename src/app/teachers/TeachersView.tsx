import Link from 'next/link';

import { formatDateToKoreanYmd } from '@/utils/date';

export type TeacherRow = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  birthDate: Date | null;
  /** 담당 반 표시 문자열(예: 유년부 1반, 2반). 관리자가 조직 관리에서 지정한다. */
  grade: string | null;
  role: 'ADMIN' | 'TEACHER';
  isActive: boolean;
};

type TeachersViewProps = {
  teachers: TeacherRow[];
  canManageAll: boolean;
  currentTeacherId?: string;
};

const EDIT_BUTTON_CLASS_NAME = 'btn btn-secondary btn-sm';

/**
 * 교사 역할 코드를 사용자 표시용 문자열로 변환한다.
 */
function getRoleLabel(role: TeacherRow['role']): string {
  return role === 'ADMIN' ? '관리자' : '교사';
}

/**
 * 교사 테이블 본문 행 목록을 렌더링한다.
 */
function TeacherTableRows({
  teachers,
  canManageAll,
  currentTeacherId,
}: {
  teachers: TeacherRow[];
  canManageAll: boolean;
  currentTeacherId?: string;
}) {
  if (teachers.length === 0) {
    return (
      <tr>
        <td colSpan={7} className="px-3 py-3 text-center text-sm text-[var(--color-muted)]">
          표시할 교사 정보가 없습니다.
        </td>
      </tr>
    );
  }

  return teachers.map((teacher) => {
    const canEdit = canManageAll || currentTeacherId === teacher.id;

    return (
      <tr key={teacher.id} className="border-t border-[var(--color-border)]">
        <td className="px-3 py-2 text-sm text-[var(--color-text)]">{teacher.name ?? '-'}</td>
        <td className="px-3 py-2 text-sm text-[var(--color-muted)]">{teacher.email}</td>
        <td className="px-3 py-2 text-sm text-[var(--color-muted)]">{teacher.phone ?? '-'}</td>
        <td className="px-3 py-2 text-sm text-[var(--color-muted)]">
          {teacher.birthDate ? formatDateToKoreanYmd(teacher.birthDate) : '-'}
        </td>
        <td className="px-3 py-2 text-sm text-[var(--color-muted)]">{teacher.grade ?? '-'}</td>
        <td className="px-3 py-2 text-sm text-[var(--color-text)]">{getRoleLabel(teacher.role)}</td>
        <td className="px-3 py-2 text-sm text-[var(--color-text)]">
          {canEdit ? (
            <Link href={`/teachers/${teacher.id}/edit`} prefetch={false} className={EDIT_BUTTON_CLASS_NAME}>
              수정
            </Link>
          ) : (
            '-'
          )}
        </td>
      </tr>
    );
  });
}

/**
 * 교사 모바일 카드 목록을 렌더링한다.
 */
function TeacherCardList({
  teachers,
  canManageAll,
  currentTeacherId,
}: {
  teachers: TeacherRow[];
  canManageAll: boolean;
  currentTeacherId?: string;
}) {
  if (teachers.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--color-border)] px-3 py-3 text-center text-sm text-[var(--color-muted)]">
        표시할 교사 정보가 없습니다.
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {teachers.map((teacher) => {
        const canEdit = canManageAll || currentTeacherId === teacher.id;

        return (
          <li key={teacher.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-base font-semibold text-[var(--color-text)]">{teacher.name ?? '-'}</p>
              <p className="text-xs font-medium text-[var(--color-muted)]">{getRoleLabel(teacher.role)}</p>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-[var(--color-muted)]">이메일</dt>
              <dd className="truncate text-right text-[var(--color-text)]">{teacher.email}</dd>
              <dt className="text-[var(--color-muted)]">연락처</dt>
              <dd className="text-right text-[var(--color-text)]">{teacher.phone ?? '-'}</dd>
              <dt className="text-[var(--color-muted)]">생년월일</dt>
              <dd className="text-right text-[var(--color-text)]">
                {teacher.birthDate ? formatDateToKoreanYmd(teacher.birthDate) : '-'}
              </dd>
              <dt className="text-[var(--color-muted)]">담당 반</dt>
              <dd className="text-right text-[var(--color-text)]">{teacher.grade ?? '-'}</dd>
            </dl>

            {canEdit ? (
              <div className="mt-3 flex justify-end">
                <Link href={`/teachers/${teacher.id}/edit`} prefetch={false} className={EDIT_BUTTON_CLASS_NAME}>
                  수정
                </Link>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 교사 정보 화면을 렌더링한다.
 * 데이터 조회는 하지 않으며, 수정 링크 노출 여부는 canManageAll/currentTeacherId로 결정된다.
 */
export default function TeachersView({ teachers, canManageAll, currentTeacherId }: TeachersViewProps) {
  const activeTeachers = teachers.filter((teacher) => teacher.isActive);
  const inactiveTeachers = teachers.filter((teacher) => !teacher.isActive);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6">
      <section className="mx-auto w-full max-w-5xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">교사 정보</h1>
          <p className="text-sm text-[var(--color-muted)]">활성 {activeTeachers.length}명</p>
        </div>

        <div className="mt-5 sm:hidden">
          <TeacherCardList teachers={activeTeachers} canManageAll={canManageAll} currentTeacherId={currentTeacherId} />
        </div>

        <div className="mt-5 hidden overflow-x-auto rounded-xl border border-[var(--color-border)] sm:block">
          <table className="w-full border-collapse text-center">
            <thead className="bg-[var(--color-surface-soft)]">
              <tr>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">이름</th>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">이메일</th>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">연락처</th>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">생년월일</th>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">담당 반</th>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">역할</th>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">관리</th>
              </tr>
            </thead>
            <tbody>
              <TeacherTableRows
                teachers={activeTeachers}
                canManageAll={canManageAll}
                currentTeacherId={currentTeacherId}
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto mt-6 w-full max-w-5xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-[var(--color-text)]">비활성 교사</h2>
          <p className="text-sm text-[var(--color-muted)]">{inactiveTeachers.length}명</p>
        </div>

        <div className="mt-5 sm:hidden">
          <TeacherCardList
            teachers={inactiveTeachers}
            canManageAll={canManageAll}
            currentTeacherId={currentTeacherId}
          />
        </div>

        <div className="mt-5 hidden overflow-x-auto rounded-xl border border-[var(--color-border)] sm:block">
          <table className="w-full border-collapse text-center">
            <thead className="bg-[var(--color-surface-soft)]">
              <tr>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">이름</th>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">이메일</th>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">연락처</th>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">생년월일</th>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">담당 반</th>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">역할</th>
                <th className="px-3 py-2 text-sm font-semibold text-[var(--color-text)]">관리</th>
              </tr>
            </thead>
            <tbody>
              <TeacherTableRows
                teachers={inactiveTeachers}
                canManageAll={canManageAll}
                currentTeacherId={currentTeacherId}
              />
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
