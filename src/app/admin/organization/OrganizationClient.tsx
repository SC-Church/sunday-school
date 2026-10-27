'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import ActionModal, { type ActionModalButton } from '@/components/common/ActionModal';
import { useToast } from '@/components/common/ToastProvider';
import { getButtonClassName } from '@/lib/button';

export type OrganizationViewModel = {
  churchName: string | null;
  schoolYear: number;
  currentSchoolYear: number;
  availableSchoolYears: number[];
  teachers: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string; sortOrder: number; isActive: boolean; classCount: number }>;
  classes: Array<{
    id: string;
    departmentId: string;
    name: string;
    sortOrder: number;
    teacherIds: string[];
    isActive: boolean;
    hasEnrollmentHistory: boolean;
    students: Array<{ id: string; name: string; isNewFriend: boolean }>;
  }>;
  unassignedStudents: Array<{ id: string; name: string; isNewFriend: boolean }>;
};

type OrganizationClientProps = {
  viewModel: OrganizationViewModel;
};

type ApiResult = { message?: string; detail?: string; copied_count?: number } | null;

const INPUT_CLASS_NAME =
  'rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]';
const SECTION_CLASS_NAME =
  'mx-auto w-full max-w-6xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6';

/**
 * 관리자 조직 관리 화면(교회 이름, 부서, 학년도별 반·교사 배정, 반별 명단)을 렌더링한다.
 * 저장 후에는 서버 데이터를 다시 읽어 화면을 갱신한다.
 */
export default function OrganizationClient({ viewModel }: OrganizationClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [churchName, setChurchName] = useState(viewModel.churchName ?? '');
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newClassNameByDepartmentId, setNewClassNameByDepartmentId] = useState<Record<string, string>>({});
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingClassName, setEditingClassName] = useState('');
  const [editingTeacherIds, setEditingTeacherIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'department' | 'class'; id: string; name: string } | null>(
    null
  );

  const teacherNameById = new Map(viewModel.teachers.map((teacher) => [teacher.id, teacher.name]));
  const classOptions = viewModel.classes
    .filter((classRecord) => classRecord.isActive)
    .map((classRecord) => ({
      id: classRecord.id,
      label:
        `${viewModel.departments.find((department) => department.id === classRecord.departmentId)?.name ?? ''} ${classRecord.name}`.trim(),
    }));

  /**
   * 관리 API를 호출하고 성공하면 화면을 새로 고친다.
   */
  async function callApi(
    key: string,
    url: string,
    body: Record<string, unknown>,
    successMessage: string
  ): Promise<ApiResult> {
    if (busyKey) {
      return null;
    }

    setBusyKey(key);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as ApiResult;

      if (!response.ok) {
        showToast({
          variant: 'error',
          message: '저장하지 못했습니다.',
          description:
            payload?.detail ?? (response.status === 403 ? '관리자 권한이 필요합니다.' : '잠시 후 다시 시도해 주세요.'),
        });
        return null;
      }

      showToast({ variant: 'success', message: successMessage });
      router.refresh();
      return payload;
    } catch {
      showToast({
        variant: 'error',
        message: '요청을 처리하지 못했습니다.',
        description: '네트워크 상태를 확인해 주세요.',
      });
      return null;
    } finally {
      setBusyKey(null);
    }
  }

  /**
   * 교회 이름을 저장한다.
   */
  function handleSaveChurchName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void callApi('church', '/api/admin/settings', { church_name: churchName }, '교회 이름을 저장했습니다.');
  }

  /**
   * 부서를 추가한다.
   */
  async function handleCreateDepartment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await callApi(
      'dept-create',
      '/api/admin/departments',
      { action: 'create', name: newDepartmentName },
      '부서를 추가했습니다.'
    );
    if (result) {
      setNewDepartmentName('');
    }
  }

  /**
   * 반을 추가한다.
   */
  async function handleCreateClass(departmentId: string) {
    const name = newClassNameByDepartmentId[departmentId] ?? '';
    const result = await callApi(
      `class-create-${departmentId}`,
      '/api/admin/classes',
      { action: 'create', department_id: departmentId, school_year: viewModel.schoolYear, name, teacher_ids: [] },
      '반을 추가했습니다.'
    );
    if (result) {
      setNewClassNameByDepartmentId((previous) => ({ ...previous, [departmentId]: '' }));
    }
  }

  /**
   * 반 편집(이름·담당 교사)을 시작한다.
   */
  function handleStartEditClass(classRecord: OrganizationViewModel['classes'][number]) {
    setEditingClassId(classRecord.id);
    setEditingClassName(classRecord.name);
    setEditingTeacherIds(classRecord.teacherIds);
  }

  /**
   * 반 편집 내용을 저장한다.
   */
  async function handleSaveClass() {
    if (!editingClassId) {
      return;
    }

    const result = await callApi(
      `class-save-${editingClassId}`,
      '/api/admin/classes',
      { action: 'update', class_id: editingClassId, name: editingClassName, teacher_ids: editingTeacherIds },
      '반 정보를 저장했습니다.'
    );
    if (result) {
      setEditingClassId(null);
    }
  }

  /**
   * 학생을 다른 반(또는 미배정)으로 옮긴다.
   */
  function handleMoveStudent(studentId: string, classId: string) {
    void callApi(
      `move-${studentId}`,
      '/api/admin/enrollments',
      { action: 'move', student_id: studentId, school_year: viewModel.schoolYear, class_id: classId || null },
      classId ? '반을 옮겼습니다.' : '미배정 처리했습니다.'
    );
  }

  /**
   * 이전 학년도의 반 구조를 이 학년도로 복사한다.
   */
  async function handleCopyClasses() {
    const result = await callApi(
      'copy',
      '/api/admin/classes',
      { action: 'copy_from_year', source_school_year: viewModel.schoolYear - 1, school_year: viewModel.schoolYear },
      '반 구조를 복사했습니다.'
    );
    if (result && result.copied_count === 0) {
      showToast({ variant: 'info', message: '복사할 반이 없거나 이미 같은 이름의 반이 있습니다.' });
    }
  }

  /**
   * 부서/반 삭제를 실행한다.
   */
  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }

    const target = deleteTarget;
    setDeleteTarget(null);

    if (target.kind === 'department') {
      await callApi(
        `dept-delete-${target.id}`,
        '/api/admin/departments',
        { action: 'delete', department_id: target.id },
        '부서를 삭제했습니다.'
      );
    } else {
      await callApi(
        `class-delete-${target.id}`,
        '/api/admin/classes',
        { action: 'delete', class_id: target.id },
        '반을 삭제했습니다.'
      );
    }
  }

  const deleteModalButtons: ActionModalButton[] = [
    { label: '취소', tone: 'neutral', variant: 'outline', autoClose: true },
    { label: '삭제', tone: 'danger', variant: 'solid', onClick: () => void handleConfirmDelete() },
  ];

  /**
   * 학생 이동 선택 상자를 렌더링한다.
   */
  function renderMoveSelect(student: { id: string; name: string }, currentClassId: string) {
    return (
      <select
        aria-label={`${student.name} 반 이동`}
        value={currentClassId}
        disabled={busyKey === `move-${student.id}`}
        onChange={(event) => handleMoveStudent(student.id, event.target.value)}
        className={`${INPUT_CLASS_NAME} py-1 text-xs`}
      >
        <option value="">미배정</option>
        {classOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="grid gap-6">
      <section className={SECTION_CLASS_NAME}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">조직 관리</h1>
          <Link
            href="/admin/promotion"
            prefetch={false}
            className={getButtonClassName({ variant: 'secondary', size: 'sm' })}
          >
            학년 진급 →
          </Link>
        </div>

        <form onSubmit={handleSaveChurchName} className="mt-5 flex flex-wrap items-end gap-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-[var(--color-text)]">교회 이름</span>
            <input
              type="text"
              value={churchName}
              onChange={(event) => setChurchName(event.target.value)}
              placeholder="예: 송촌장로교회"
              maxLength={40}
              className={`${INPUT_CLASS_NAME} w-64`}
            />
          </label>
          <button
            type="submit"
            disabled={busyKey !== null}
            className={getButtonClassName({ variant: 'primary', size: 'sm' })}
          >
            {busyKey === 'church' ? '저장 중...' : '저장'}
          </button>
          <p className="w-full text-xs text-[var(--color-muted)]">헤더와 로그인 화면에 표시됩니다.</p>
        </form>
      </section>

      <section className={SECTION_CLASS_NAME}>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">부서</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          순서 번호가 작을수록 앞에 표시되며, 진급 시 다음 부서로 넘길 때도 이 순서를 씁니다.
        </p>

        <ul className="mt-4 grid gap-2">
          {viewModel.departments.map((department) => (
            <li
              key={department.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3"
            >
              <DepartmentRow
                department={department}
                isBusy={busyKey !== null}
                onSave={(changes) =>
                  void callApi(
                    `dept-${department.id}`,
                    '/api/admin/departments',
                    { action: 'update', department_id: department.id, ...changes },
                    '부서를 저장했습니다.'
                  )
                }
                onDelete={() => setDeleteTarget({ kind: 'department', id: department.id, name: department.name })}
              />
            </li>
          ))}
        </ul>

        <form onSubmit={handleCreateDepartment} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newDepartmentName}
            onChange={(event) => setNewDepartmentName(event.target.value)}
            placeholder="새 부서 이름 (예: 청년부)"
            maxLength={20}
            className={`${INPUT_CLASS_NAME} w-56`}
          />
          <button
            type="submit"
            disabled={busyKey !== null || !newDepartmentName.trim()}
            className={getButtonClassName({ variant: 'primary', size: 'sm' })}
          >
            부서 추가
          </button>
        </form>
      </section>

      <section className={SECTION_CLASS_NAME}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">반과 학생 명단</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              반은 학년도마다 따로 관리합니다. 학생을 다른 반으로 옮기면 이전 기록은 이력으로 남고 출석·달란트는 그대로
              이어집니다.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="학년도 선택">
            {viewModel.availableSchoolYears.map((year) => (
              <Link
                key={year}
                href={`/admin/organization?school_year=${year}`}
                prefetch={false}
                aria-current={year === viewModel.schoolYear ? 'page' : undefined}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium ${
                  year === viewModel.schoolYear
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-soft)]'
                }`}
              >
                {year}학년도{year === viewModel.currentSchoolYear ? ' (현재)' : ''}
              </Link>
            ))}
          </nav>
        </div>

        {viewModel.classes.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
            {viewModel.schoolYear}학년도에 아직 반이 없습니다. 부서마다 아래에서 반을 추가하거나, 이전 학년도의 반
            구조를 복사할 수 있습니다.
            <div className="mt-2">
              <button
                type="button"
                onClick={handleCopyClasses}
                disabled={busyKey !== null}
                className={getButtonClassName({ variant: 'secondary', size: 'sm' })}
              >
                {busyKey === 'copy' ? '복사 중...' : `${viewModel.schoolYear - 1}학년도 반 구조 복사`}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-5">
          {viewModel.departments
            .filter((department) => department.isActive)
            .map((department) => {
              const departmentClasses = viewModel.classes.filter(
                (classRecord) => classRecord.departmentId === department.id
              );

              return (
                <div key={department.id} className="rounded-xl border border-[var(--color-border)] p-3 sm:p-4">
                  <h3 className="text-base font-semibold text-[var(--color-text)]">{department.name}</h3>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {departmentClasses.map((classRecord) => {
                      const isEditing = editingClassId === classRecord.id;

                      return (
                        <article
                          key={classRecord.id}
                          className={`rounded-xl border p-3 ${classRecord.isActive ? 'border-[var(--color-border)]' : 'border-dashed border-[var(--color-border)] opacity-70'}`}
                        >
                          {isEditing ? (
                            <div className="grid gap-2">
                              <input
                                type="text"
                                value={editingClassName}
                                onChange={(event) => setEditingClassName(event.target.value)}
                                maxLength={20}
                                className={INPUT_CLASS_NAME}
                              />
                              <div className="flex flex-wrap gap-2 text-sm">
                                {viewModel.teachers.length === 0 ? (
                                  <span className="text-xs text-[var(--color-muted)]">승인된 교사가 없습니다.</span>
                                ) : null}
                                {viewModel.teachers.map((teacher) => (
                                  <label
                                    key={teacher.id}
                                    className="flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text)]"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={editingTeacherIds.includes(teacher.id)}
                                      onChange={(event) =>
                                        setEditingTeacherIds((previous) =>
                                          event.target.checked
                                            ? [...previous, teacher.id]
                                            : previous.filter((id) => id !== teacher.id)
                                        )
                                      }
                                    />
                                    {teacher.name}
                                  </label>
                                ))}
                              </div>
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingClassId(null)}
                                  className={getButtonClassName({ variant: 'secondary', size: 'sm' })}
                                >
                                  취소
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveClass()}
                                  disabled={busyKey !== null}
                                  className={getButtonClassName({ variant: 'primary', size: 'sm' })}
                                >
                                  저장
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-[var(--color-text)]">
                                  {classRecord.name}
                                  {!classRecord.isActive ? (
                                    <span className="ml-1 text-xs text-[var(--color-muted)]">(비활성)</span>
                                  ) : null}
                                  <span className="ml-1.5 text-xs font-normal text-[var(--color-muted)]">
                                    {classRecord.students.length}명
                                  </span>
                                </p>
                                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                                  담당:{' '}
                                  {classRecord.teacherIds
                                    .map((id) => teacherNameById.get(id) ?? '(삭제된 교사)')
                                    .join(', ') || '미지정'}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditClass(classRecord)}
                                  className={getButtonClassName({ variant: 'secondary', size: 'sm' })}
                                >
                                  편집
                                </button>
                                <button
                                  type="button"
                                  disabled={busyKey !== null}
                                  onClick={() =>
                                    void callApi(
                                      `class-active-${classRecord.id}`,
                                      '/api/admin/classes',
                                      { action: 'update', class_id: classRecord.id, is_active: !classRecord.isActive },
                                      classRecord.isActive ? '반을 비활성 처리했습니다.' : '반을 다시 활성화했습니다.'
                                    )
                                  }
                                  className={getButtonClassName({ variant: 'secondary', size: 'sm' })}
                                >
                                  {classRecord.isActive ? '비활성' : '활성'}
                                </button>
                                {!classRecord.hasEnrollmentHistory ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteTarget({ kind: 'class', id: classRecord.id, name: classRecord.name })
                                    }
                                    className={getButtonClassName({ variant: 'secondary', tone: 'danger', size: 'sm' })}
                                  >
                                    삭제
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          )}

                          <ul className="mt-3 grid gap-1.5">
                            {classRecord.students.length === 0 ? (
                              <li className="text-xs text-[var(--color-muted)]">배정된 학생이 없습니다.</li>
                            ) : (
                              classRecord.students.map((student) => (
                                <li key={student.id} className="flex items-center justify-between gap-2 text-sm">
                                  <span className="text-[var(--color-text)]">
                                    {student.name}
                                    {student.isNewFriend ? (
                                      <span className="ml-1 text-xs text-[var(--color-primary)]">새친구</span>
                                    ) : null}
                                  </span>
                                  {renderMoveSelect(student, classRecord.id)}
                                </li>
                              ))
                            )}
                          </ul>
                        </article>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={newClassNameByDepartmentId[department.id] ?? ''}
                      onChange={(event) =>
                        setNewClassNameByDepartmentId((previous) => ({
                          ...previous,
                          [department.id]: event.target.value,
                        }))
                      }
                      placeholder="새 반 이름 (예: 3학년, 중1)"
                      maxLength={20}
                      className={`${INPUT_CLASS_NAME} w-52`}
                    />
                    <button
                      type="button"
                      disabled={busyKey !== null || !(newClassNameByDepartmentId[department.id] ?? '').trim()}
                      onClick={() => void handleCreateClass(department.id)}
                      className={getButtonClassName({ variant: 'primary', size: 'sm' })}
                    >
                      반 추가
                    </button>
                  </div>
                </div>
              );
            })}
        </div>

        <div className="mt-5 rounded-xl border border-[var(--color-border)] p-3 sm:p-4">
          <h3 className="text-base font-semibold text-[var(--color-text)]">
            미배정 학생{' '}
            <span className="text-sm font-normal text-[var(--color-muted)]">
              {viewModel.unassignedStudents.length}명
            </span>
          </h3>
          {viewModel.unassignedStudents.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-muted)]">모든 학생이 반에 배정되어 있습니다.</p>
          ) : (
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {viewModel.unassignedStudents.map((student) => (
                <li key={student.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-[var(--color-text)]">
                    {student.name}
                    {student.isNewFriend ? (
                      <span className="ml-1 text-xs text-[var(--color-primary)]">새친구</span>
                    ) : null}
                  </span>
                  {renderMoveSelect(student, '')}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <ActionModal
        isOpen={deleteTarget !== null}
        title={deleteTarget?.kind === 'department' ? '부서 삭제' : '반 삭제'}
        message={`'${deleteTarget?.name ?? ''}'을(를) 삭제할까요? 되돌릴 수 없습니다.`}
        buttons={deleteModalButtons}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/**
 * 부서 한 줄(이름·순서·활성) 편집 UI를 렌더링한다.
 */
function DepartmentRow({
  department,
  isBusy,
  onSave,
  onDelete,
}: {
  department: OrganizationViewModel['departments'][number];
  isBusy: boolean;
  onSave: (changes: { name?: string; sort_order?: number; is_active?: boolean }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(department.name);
  const [sortOrder, setSortOrder] = useState(String(department.sortOrder));
  const hasChanges = name.trim() !== department.name || Number(sortOrder) !== department.sortOrder;

  return (
    <>
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={20}
        aria-label="부서 이름"
        className={`${INPUT_CLASS_NAME} w-40`}
      />
      <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
        순서
        <input
          type="number"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
          className={`${INPUT_CLASS_NAME} w-16 py-1`}
          min={1}
        />
      </label>
      <span className="text-xs text-[var(--color-muted)]">반 {department.classCount}개</span>
      {!department.isActive ? <span className="text-xs text-[var(--color-danger)]">비활성</span> : null}
      <div className="ml-auto flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={isBusy || !hasChanges || !name.trim() || !Number.isInteger(Number(sortOrder))}
          onClick={() => onSave({ name: name.trim(), sort_order: Number(sortOrder) })}
          className={getButtonClassName({ variant: 'primary', size: 'sm' })}
        >
          저장
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onSave({ is_active: !department.isActive })}
          className={getButtonClassName({ variant: 'secondary', size: 'sm' })}
        >
          {department.isActive ? '비활성' : '활성'}
        </button>
        {department.classCount === 0 ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={onDelete}
            className={getButtonClassName({ variant: 'secondary', tone: 'danger', size: 'sm' })}
          >
            삭제
          </button>
        ) : null}
      </div>
    </>
  );
}
