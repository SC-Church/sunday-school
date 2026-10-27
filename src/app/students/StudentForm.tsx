'use client';

import { useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import ActionModal, { type ActionModalButton } from '@/components/common/ActionModal';
import RestrictedInput from '@/components/common/RestrictedInput';
import { useToast } from '@/components/common/ToastProvider';
import type { StudentInputPayload } from '@/lib/validation/student';
import { Gender, Relationship } from '@/types/domain';

const INPUT_CLASS_NAME =
  'rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]';

type StudentFormMode = 'create' | 'edit';

export type StudentFormClassGroup = {
  departmentId: string;
  departmentName: string;
  classes: Array<{ id: string; name: string }>;
};

type StudentFormProps = {
  mode: StudentFormMode;
  studentId?: string;
  initialValues: StudentInputPayload;
  /** 현재 학년도 반 선택지(부서별) */
  classGroups: StudentFormClassGroup[];
};

type FieldErrorMap = Partial<Record<keyof StudentInputPayload, string>>;

type MutationErrorResponse = {
  message: string;
  errors?: Record<string, string>;
};

/**
 * 폼 필드 라벨을 렌더링한다.
 */
function FieldLabel({
  label,
  required = false,
  showOptional = false,
}: {
  label: string;
  required?: boolean;
  showOptional?: boolean;
}) {
  return (
    <span className="text-sm font-medium text-[var(--color-text)]">
      {label}
      {required ? (
        <span className="ml-1 text-[var(--color-primary)]">*</span>
      ) : showOptional ? (
        <span className="ml-1 text-xs text-[var(--color-muted)]">(선택)</span>
      ) : null}
    </span>
  );
}

/**
 * 필드 하단에 검증 오류 메시지를 렌더링한다.
 */
function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <span className="text-xs text-[var(--color-danger)]">{message}</span>;
}

/**
 * 학생 등록/수정 폼을 렌더링하고 API를 통해 저장한다.
 */
export default function StudentForm({ mode, studentId, initialValues, classGroups }: StudentFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * 폼 입력값을 API 요청 본문 형태로 변환한다.
   */
  function buildPayload(form: HTMLFormElement): StudentInputPayload {
    const formData = new FormData(form);
    const readValue = (key: keyof StudentInputPayload): string => {
      const value = formData.get(key);
      return typeof value === 'string' ? value : '';
    };

    return {
      name: readValue('name'),
      gender: readValue('gender'),
      birth_date: readValue('birth_date'),
      address: readValue('address'),
      phone: readValue('phone'),
      guardian_name: readValue('guardian_name'),
      guardian_relationship: readValue('guardian_relationship'),
      guardian_phone: readValue('guardian_phone'),
      class_id: readValue('class_id'),
      note: readValue('note'),
      is_new_friend: formData.get('is_new_friend') === 'on',
      first_visit_date: readValue('first_visit_date'),
    };
  }

  /**
   * 학생 정보를 저장한다.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const form = event.currentTarget;
    setIsSubmitting(true);
    setFieldErrors({});

    try {
      const response = await fetch(mode === 'create' ? '/api/students' : `/api/students/${studentId}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(buildPayload(form)),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as MutationErrorResponse | null;

        if (errorPayload?.message === 'invalid_input' && errorPayload.errors) {
          setFieldErrors(errorPayload.errors as FieldErrorMap);
          showToast({
            variant: 'error',
            message: '입력값을 확인해 주세요.',
            description: Object.values(errorPayload.errors)[0],
          });
          return;
        }

        showToast({
          variant: 'error',
          message: mode === 'create' ? '학생 등록에 실패했습니다.' : '학생 수정에 실패했습니다.',
          description: response.status === 403 ? '권한이 없습니다.' : '잠시 후 다시 시도해 주세요.',
        });
        return;
      }

      if (mode === 'create') {
        form.reset();
        showToast({ variant: 'success', message: '학생을 등록했습니다.' });
        return;
      }

      showToast({ variant: 'success', message: '학생 정보를 수정했습니다.' });
      router.refresh();
    } catch {
      showToast({
        variant: 'error',
        message: '요청을 처리하지 못했습니다.',
        description: '네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * 학생을 삭제하고 목록으로 이동한다.
   */
  async function handleDeleteStudent() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/students/${studentId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('delete_failed');
      }

      setIsDeleteModalOpen(false);
      router.push('/students?success_code=student_deleted');
    } catch {
      showToast({
        variant: 'error',
        message: '학생 삭제에 실패했습니다.',
        description: '잠시 후 다시 시도해 주세요.',
      });
    } finally {
      setIsDeleting(false);
    }
  }

  const deleteModalButtons = useMemo<ActionModalButton[]>(
    () => [
      { label: '취소', tone: 'neutral', variant: 'outline', autoClose: true, disabled: isDeleting },
      {
        label: isDeleting ? '삭제 중...' : '삭제',
        tone: 'danger',
        variant: 'solid',
        disabled: isDeleting,
        onClick: handleDeleteStudent,
      },
    ],
    [isDeleting]
  );

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-6 grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1.5">
            <FieldLabel label="이름" required />
            <input name="name" type="text" defaultValue={initialValues.name} className={INPUT_CLASS_NAME} />
            <FieldError message={fieldErrors.name} />
          </label>

          <label className="grid gap-1.5">
            <FieldLabel label="성별" required />
            <select name="gender" defaultValue={initialValues.gender} className={INPUT_CLASS_NAME}>
              <option value="">선택</option>
              <option value={Gender.MALE}>남</option>
              <option value={Gender.FEMALE}>여</option>
            </select>
            <FieldError message={fieldErrors.gender} />
          </label>

          <label className="grid gap-1.5">
            <FieldLabel label="생년월일" required />
            <input name="birth_date" type="date" defaultValue={initialValues.birth_date} className={INPUT_CLASS_NAME} />
            <FieldError message={fieldErrors.birth_date} />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1.5 sm:col-span-2">
            <FieldLabel label="주소 (시, 구, 동까지만 입력)" required />
            <input name="address" type="text" defaultValue={initialValues.address} className={INPUT_CLASS_NAME} />
            <FieldError message={fieldErrors.address} />
          </label>

          <label className="grid gap-1.5">
            <FieldLabel label="전화번호" showOptional />
            <RestrictedInput
              filterType="phone"
              name="phone"
              type="text"
              inputMode="numeric"
              placeholder="010-0000-0000"
              maxLength={13}
              defaultValue={initialValues.phone}
              className={INPUT_CLASS_NAME}
            />
            <FieldError message={fieldErrors.phone} />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1.5">
            <FieldLabel label="보호자 성함" />
            <input
              name="guardian_name"
              type="text"
              defaultValue={initialValues.guardian_name}
              className={INPUT_CLASS_NAME}
            />
            <FieldError message={fieldErrors.guardian_name} />
          </label>

          <label className="grid gap-1.5">
            <FieldLabel label="관계" />
            <select
              name="guardian_relationship"
              defaultValue={initialValues.guardian_relationship}
              className={INPUT_CLASS_NAME}
            >
              <option value="">선택</option>
              <option value={Relationship.FATHER}>부</option>
              <option value={Relationship.MOTHER}>모</option>
              <option value={Relationship.GRANDFATHER}>조부</option>
              <option value={Relationship.GRANDMOTHER}>조모</option>
              <option value={Relationship.ETC}>기타</option>
            </select>
            <FieldError message={fieldErrors.guardian_relationship} />
          </label>

          <label className="grid gap-1.5">
            <FieldLabel label="보호자 전화번호" />
            <RestrictedInput
              filterType="phone"
              name="guardian_phone"
              type="text"
              inputMode="numeric"
              placeholder="010-0000-0000"
              maxLength={13}
              defaultValue={initialValues.guardian_phone}
              className={INPUT_CLASS_NAME}
            />
            <FieldError message={fieldErrors.guardian_phone} />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1.5">
            <FieldLabel label="소속 반" showOptional />
            <select name="class_id" defaultValue={initialValues.class_id ?? ''} className={INPUT_CLASS_NAME}>
              <option value="">미배정</option>
              {classGroups.map((group) => (
                <optgroup key={group.departmentId} label={group.departmentName}>
                  {group.classes.map((classOption) => (
                    <option key={classOption.id} value={classOption.id}>
                      {classOption.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <FieldError message={fieldErrors.class_id} />
            {mode === 'edit' ? (
              <span className="text-xs text-[var(--color-muted)]">
                반을 바꾸면 이전 반 기록은 이력으로 남고 출석·달란트는 그대로 이어집니다.
              </span>
            ) : null}
          </label>

          <label className="flex items-center gap-2 self-end rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)]">
            <input
              name="is_new_friend"
              type="checkbox"
              defaultChecked={Boolean(initialValues.is_new_friend)}
              className="h-4 w-4 rounded border border-[var(--color-border-strong)]"
            />
            새친구
          </label>

          <label className="grid gap-1.5">
            <FieldLabel label="첫 방문일" showOptional />
            <input
              name="first_visit_date"
              type="date"
              defaultValue={initialValues.first_visit_date ?? ''}
              className={INPUT_CLASS_NAME}
            />
            <FieldError message={fieldErrors.first_visit_date} />
          </label>
        </div>

        <label className="grid gap-1.5">
          <FieldLabel label="특이사항" showOptional />
          <textarea
            name="note"
            rows={3}
            defaultValue={initialValues.note ?? ''}
            placeholder="알레르기, 가정 상황, 지도 시 참고할 점 등 (교사에게만 보입니다)"
            className={INPUT_CLASS_NAME}
          />
          <FieldError message={fieldErrors.note} />
        </label>

        <div className="mt-2 flex justify-end gap-2">
          <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-md">
            {isSubmitting ? '저장 중...' : mode === 'create' ? '등록' : '수정'}
          </button>
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              disabled={isDeleting}
              className="btn btn-danger btn-md"
            >
              삭제
            </button>
          ) : null}
        </div>
      </form>

      {mode === 'edit' ? (
        <ActionModal
          isOpen={isDeleteModalOpen}
          title="학생 삭제"
          message="정말 삭제하시겠습니까?"
          buttons={deleteModalButtons}
          onClose={() => setIsDeleteModalOpen(false)}
        />
      ) : null}
    </>
  );
}
