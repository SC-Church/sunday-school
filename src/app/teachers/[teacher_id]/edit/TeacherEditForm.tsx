'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import RestrictedInput from '@/components/common/RestrictedInput';
import { useToast } from '@/components/common/ToastProvider';
import type { TeacherUpdatePayload } from '@/lib/validation/teacher';

const INPUT_CLASS_NAME =
  'rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]';

type TeacherEditFormProps = {
  teacherId: string;
  email: string;
  isAdmin: boolean;
  initialValues: {
    name: string;
    phone: string;
    birth_date: string;
    is_active: boolean;
  };
  /** 담당 반 표시 문자열(관리자가 조직 관리에서 지정) */
  assignedClassesText: string;
};

type FieldErrorMap = Partial<Record<keyof TeacherUpdatePayload, string>>;

/**
 * 교사 정보 수정 폼을 렌더링하고 API를 통해 저장한다.
 */
export default function TeacherEditForm({
  teacherId,
  email,
  isAdmin,
  initialValues,
  assignedClassesText,
}: TeacherEditFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 교사 정보를 저장한다.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const readValue = (key: string): string => {
      const value = formData.get(key);
      return typeof value === 'string' ? value : '';
    };

    setIsSubmitting(true);
    setFieldErrors({});

    try {
      const response = await fetch(`/api/teachers/${teacherId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name: readValue('name'),
          phone: readValue('phone'),
          birth_date: readValue('birth_date'),
          is_active: formData.get('is_active') === 'on',
        }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          message?: string;
          errors?: Record<string, string>;
        } | null;

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
          message: '교사 정보 수정에 실패했습니다.',
          description: response.status === 403 ? '수정 권한이 없습니다.' : '잠시 후 다시 시도해 주세요.',
        });
        return;
      }

      showToast({ variant: 'success', message: '교사 정보를 수정했습니다.' });
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

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">
            이름
            <span className="ml-1 text-[var(--color-primary)]">*</span>
          </span>
          <input name="name" type="text" defaultValue={initialValues.name} className={INPUT_CLASS_NAME} />
          {fieldErrors.name ? <span className="text-xs text-[var(--color-danger)]">{fieldErrors.name}</span> : null}
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">이메일</span>
          <input
            type="text"
            value={email}
            readOnly
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-muted)]"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">연락처</span>
          <RestrictedInput
            filterType="phone"
            name="phone"
            type="text"
            inputMode="numeric"
            defaultValue={initialValues.phone}
            placeholder="010-0000-0000"
            maxLength={13}
            className={INPUT_CLASS_NAME}
          />
          {fieldErrors.phone ? <span className="text-xs text-[var(--color-danger)]">{fieldErrors.phone}</span> : null}
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">생년월일</span>
          <input name="birth_date" type="date" defaultValue={initialValues.birth_date} className={INPUT_CLASS_NAME} />
          {fieldErrors.birth_date ? (
            <span className="text-xs text-[var(--color-danger)]">{fieldErrors.birth_date}</span>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">담당 반</span>
          <input
            type="text"
            value={assignedClassesText || '미지정'}
            readOnly
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-muted)]"
          />
          <span className="text-xs text-[var(--color-muted)]">담당 반은 관리자가 [조직 관리]에서 지정합니다.</span>
        </label>

        <label className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)]">
          <input
            name="is_active"
            type="checkbox"
            defaultChecked={initialValues.is_active}
            disabled={!isAdmin}
            className="h-4 w-4 rounded border border-[var(--color-border-strong)]"
          />
          활성 상태
          {!isAdmin ? <span className="text-xs text-[var(--color-muted)]">(관리자 전용)</span> : null}
        </label>
      </div>

      <div className="mt-2 flex justify-end">
        <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-md">
          {isSubmitting ? '저장 중...' : '수정'}
        </button>
      </div>
    </form>
  );
}
