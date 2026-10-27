'use client';

import { useState } from 'react';

import ActionModal, { type ActionModalButton } from '@/components/common/ActionModal';
import { useToast } from '@/components/common/ToastProvider';
import { TEACHER_ROLE, type TeacherApprovalStatus, type TeacherRole } from '@/types/teacher';

export type PendingTeacherRow = {
  id: string;
  name: string | null;
  email: string;
  requestedAt: string;
};

export type ProcessedTeacherRow = {
  id: string;
  name: string | null;
  email: string;
  approvalStatus: TeacherApprovalStatus;
  role: TeacherRole;
  processedAt: string;
};

type SignupManagementListProps = {
  currentAdminId: string;
  initialPendingTeachers: PendingTeacherRow[];
  initialProcessedTeachers: ProcessedTeacherRow[];
};

type SignupManagementAction = 'approve' | 'reject' | 'toggle_role' | 'delete' | 'reset_password';

type IssuedTemporaryPassword = {
  teacherLabel: string;
  temporaryPassword: string;
};

/**
 * 날짜 문자열을 한국 시간 표시용으로 포맷한다.
 */
function formatDateTime(isoDateText: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(isoDateText));
}

/**
 * 가입 관리 목록과 승인/거절/권한/삭제 액션을 렌더링한다.
 */
export default function SignupManagementList({
  currentAdminId,
  initialPendingTeachers,
  initialProcessedTeachers,
}: SignupManagementListProps) {
  const { showToast } = useToast();
  const [pendingTeachers, setPendingTeachers] = useState(initialPendingTeachers);
  const [processedTeachers, setProcessedTeachers] = useState(initialProcessedTeachers);
  const [pendingActionTeacherId, setPendingActionTeacherId] = useState<string | null>(null);
  const [deleteTargetTeacherId, setDeleteTargetTeacherId] = useState<string | null>(null);
  const [resetTargetTeacher, setResetTargetTeacher] = useState<ProcessedTeacherRow | null>(null);
  const [issuedPassword, setIssuedPassword] = useState<IssuedTemporaryPassword | null>(null);

  /**
   * 가입 관리 API를 호출하고 실패 시 토스트를 표시한다.
   */
  async function requestSignupAction(
    action: SignupManagementAction,
    teacherId: string,
    nextRole?: TeacherRole
  ): Promise<Record<string, unknown> | null> {
    setPendingActionTeacherId(teacherId);

    try {
      const response = await fetch('/api/signup-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action, teacher_id: teacherId, next_role: nextRole }),
      });

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

      if (!response.ok) {
        const message = payload?.message;

        showToast({
          variant: 'error',
          message: '작업에 실패했습니다.',
          description:
            message === 'self_protected'
              ? '본인 계정은 이 작업을 수행할 수 없습니다.'
              : message === 'forbidden'
                ? '관리자 권한이 필요합니다.'
                : '잠시 후 다시 시도해 주세요.',
        });
        return null;
      }

      return payload;
    } catch {
      showToast({
        variant: 'error',
        message: '요청을 처리하지 못했습니다.',
        description: '네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
      });
      return null;
    } finally {
      setPendingActionTeacherId(null);
    }
  }

  /**
   * 가입 요청을 승인하거나 거절한다.
   */
  async function handleProcessSignup(teacherId: string, action: 'approve' | 'reject') {
    const payload = await requestSignupAction(action, teacherId);

    if (!payload) {
      return;
    }

    const processedTeacher = payload.teacher as ProcessedTeacherRow | undefined;

    setPendingTeachers((prevTeachers) => prevTeachers.filter((teacher) => teacher.id !== teacherId));

    if (processedTeacher) {
      setProcessedTeachers((prevTeachers) => [processedTeacher, ...prevTeachers]);
    }

    showToast({
      variant: 'success',
      message: action === 'approve' ? '가입을 승인했습니다.' : '가입을 거절했습니다.',
    });
  }

  /**
   * 승인된 교사의 관리자 권한을 토글한다.
   */
  async function handleToggleAdminRole(teacherId: string, nextRole: TeacherRole) {
    const payload = await requestSignupAction('toggle_role', teacherId, nextRole);

    if (!payload) {
      return;
    }

    setProcessedTeachers((prevTeachers) =>
      prevTeachers.map((teacher) => (teacher.id === teacherId ? { ...teacher, role: nextRole } : teacher))
    );

    showToast({
      variant: 'success',
      message: nextRole === TEACHER_ROLE.ADMIN ? '관리자 권한을 부여했습니다.' : '관리자 권한을 해제했습니다.',
    });
  }

  /**
   * 가입된 교사 계정을 삭제한다.
   */
  async function handleDeleteTeacher(teacherId: string) {
    const payload = await requestSignupAction('delete', teacherId);

    setDeleteTargetTeacherId(null);

    if (!payload) {
      return;
    }

    setProcessedTeachers((prevTeachers) => prevTeachers.filter((teacher) => teacher.id !== teacherId));
    showToast({ variant: 'success', message: '계정을 삭제했습니다.' });
  }

  /**
   * 교사 비밀번호를 임시 비밀번호로 초기화하고, 발급된 값을 한 번만 보여 준다.
   */
  async function handleResetPassword(teacher: ProcessedTeacherRow) {
    setResetTargetTeacher(null);

    const payload = await requestSignupAction('reset_password', teacher.id);
    const temporaryPassword = payload?.temporary_password;

    if (typeof temporaryPassword !== 'string') {
      return;
    }

    setIssuedPassword({ teacherLabel: teacher.name ?? teacher.email, temporaryPassword });
  }

  /**
   * 발급된 임시 비밀번호를 클립보드에 복사한다.
   */
  async function handleCopyIssuedPassword() {
    if (!issuedPassword) {
      return;
    }

    try {
      await navigator.clipboard.writeText(issuedPassword.temporaryPassword);
      showToast({ variant: 'success', message: '임시 비밀번호를 복사했습니다.' });
    } catch {
      showToast({ variant: 'error', message: '복사하지 못했습니다.', description: '직접 선택해 복사해 주세요.' });
    }
  }

  const resetModalButtons: ActionModalButton[] = [
    { label: '취소', tone: 'neutral', variant: 'outline', autoClose: true },
    {
      label: '초기화',
      tone: 'danger',
      variant: 'solid',
      disabled: pendingActionTeacherId !== null,
      onClick: () => {
        if (resetTargetTeacher) {
          void handleResetPassword(resetTargetTeacher);
        }
      },
    },
  ];

  const issuedPasswordModalButtons: ActionModalButton[] = [
    { label: '복사', tone: 'neutral', variant: 'outline', onClick: () => void handleCopyIssuedPassword() },
    { label: '확인', tone: 'primary', variant: 'solid', autoClose: true },
  ];

  const deleteModalButtons: ActionModalButton[] = [
    { label: '취소', tone: 'neutral', variant: 'outline', autoClose: true },
    {
      label: '삭제',
      tone: 'danger',
      variant: 'solid',
      disabled: pendingActionTeacherId !== null,
      onClick: () => {
        if (deleteTargetTeacherId) {
          void handleDeleteTeacher(deleteTargetTeacherId);
        }
      },
    },
  ];

  return (
    <>
      <section className="mx-auto w-full max-w-4xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">가입 관리</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">신규 가입 요청을 승인하거나 거절할 수 있습니다.</p>

        <div className="mt-6 space-y-3">
          {pendingTeachers.length === 0 ? (
            <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-muted)]">
              현재 승인 대기 중인 계정이 없습니다.
            </p>
          ) : (
            pendingTeachers.map((teacher) => {
              const isBusy = pendingActionTeacherId === teacher.id;

              return (
                <article
                  key={teacher.id}
                  className="flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text)]">{teacher.name ?? '이름 미입력'}</p>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{teacher.email}</p>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      가입 요청: {formatDateTime(teacher.requestedAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleProcessSignup(teacher.id, 'approve')}
                      className="btn btn-primary btn-md"
                    >
                      {isBusy ? '처리 중...' : '승인'}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleProcessSignup(teacher.id, 'reject')}
                      className="btn btn-danger btn-md"
                    >
                      거절
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="mx-auto mt-6 w-full max-w-4xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
        <h2 className="text-xl font-bold text-[var(--color-text)]">처리된 가입 목록 / 권한 관리</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          승인된 계정은 역할 변경·비밀번호 초기화·삭제가 가능하며, 거절된 계정은 상태 확인과 삭제만 가능합니다.
        </p>

        <div className="mt-6 space-y-3">
          {processedTeachers.length === 0 ? (
            <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-muted)]">
              처리된 계정이 없습니다.
            </p>
          ) : (
            processedTeachers.map((teacher) => {
              const isApproved = teacher.approvalStatus === 'APPROVED';
              const isAdmin = teacher.role === TEACHER_ROLE.ADMIN;
              const isMe = teacher.id === currentAdminId;
              const nextRole: TeacherRole = isAdmin ? TEACHER_ROLE.TEACHER : TEACHER_ROLE.ADMIN;
              const isBusy = pendingActionTeacherId === teacher.id;

              return (
                <article
                  key={teacher.id}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text)]">{teacher.name ?? '이름 미입력'}</p>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{teacher.email}</p>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      처리 시각: {formatDateTime(teacher.processedAt)}
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-2 sm:ml-auto sm:items-end">
                    <div className="flex items-center gap-2">
                      {isApproved ? (
                        <>
                          <span
                            className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                              isAdmin
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                                : 'border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-muted)]'
                            }`}
                          >
                            {isAdmin ? '관리자' : '일반 교사'}
                          </span>

                          <button
                            type="button"
                            disabled={(isMe && isAdmin) || isBusy}
                            onClick={() => handleToggleAdminRole(teacher.id, nextRole)}
                            className="btn btn-secondary btn-sm h-8"
                          >
                            {isAdmin ? '관리자 해제' : '관리자 부여'}
                          </button>

                          <button
                            type="button"
                            disabled={isMe || isBusy}
                            onClick={() => setResetTargetTeacher(teacher)}
                            className="btn btn-secondary btn-sm h-8"
                          >
                            비밀번호 초기화
                          </button>
                        </>
                      ) : (
                        <span className="inline-flex w-fit items-center rounded-full border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-2.5 py-1 text-xs font-medium text-[var(--color-danger)]">
                          거절됨
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={isMe || isBusy}
                        onClick={() => setDeleteTargetTeacherId(teacher.id)}
                        className="btn btn-danger btn-sm h-8"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <ActionModal
        isOpen={resetTargetTeacher !== null}
        title="비밀번호 초기화"
        message={`${resetTargetTeacher?.name ?? resetTargetTeacher?.email ?? ''} 님의 비밀번호를 임시 비밀번호로 바꿉니다.\n기존 비밀번호로는 더 이상 로그인할 수 없습니다.`}
        buttons={resetModalButtons}
        onClose={() => setResetTargetTeacher(null)}
      />

      <ActionModal
        isOpen={issuedPassword !== null}
        title="임시 비밀번호 발급"
        message={`${issuedPassword?.teacherLabel ?? ''} 님의 임시 비밀번호:\n\n${issuedPassword?.temporaryPassword ?? ''}\n\n이 창을 닫으면 다시 볼 수 없습니다. 교사에게 직접 전달하고, 로그인 후 [교사 정보 > 수정]에서 비밀번호를 바꾸도록 안내해 주세요.`}
        buttons={issuedPasswordModalButtons}
        onClose={() => setIssuedPassword(null)}
      />

      <ActionModal
        isOpen={deleteTargetTeacherId !== null}
        title="계정 삭제"
        message="정말 삭제하시겠습니까?"
        buttons={deleteModalButtons}
        onClose={() => setDeleteTargetTeacherId(null)}
      />
    </>
  );
}
