'use client';

import { useState } from 'react';

import AuthTextField from '@/components/common/AuthTextField';
import { useToast } from '@/components/common/ToastProvider';
import { getButtonClassName } from '@/lib/button';
import { PASSWORD_MIN_LENGTH, type PasswordChangePayload } from '@/lib/validation/auth';

type PasswordChangeFormProps = {
  teacherId: string;
};

type FieldErrorMap = Partial<Record<keyof PasswordChangePayload, string>>;

/**
 * 본인 비밀번호 변경 폼을 렌더링한다.
 */
export default function PasswordChangeForm({ teacherId }: PasswordChangeFormProps) {
  const { showToast } = useToast();
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 현재 비밀번호 확인 후 새 비밀번호로 변경한다.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const payload: PasswordChangePayload = {
      current_password: String(formData.get('current_password') ?? ''),
      new_password: String(formData.get('new_password') ?? ''),
      new_password_confirm: String(formData.get('new_password_confirm') ?? ''),
    };

    setIsSubmitting(true);
    setFieldErrors({});

    try {
      const response = await fetch(`/api/teachers/${teacherId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { errors?: FieldErrorMap } | null;

        if (errorPayload?.errors) {
          setFieldErrors(errorPayload.errors);
          return;
        }

        showToast({
          variant: 'error',
          message: '비밀번호를 변경하지 못했습니다.',
          description: response.status === 403 ? '본인 계정만 변경할 수 있습니다.' : '잠시 후 다시 시도해 주세요.',
        });
        return;
      }

      formElement.reset();
      showToast({ variant: 'success', message: '비밀번호를 변경했습니다.' });
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
    <form onSubmit={handleSubmit} className="mt-4 grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <AuthTextField
          label="현재 비밀번호"
          name="current_password"
          type="password"
          autoComplete="current-password"
          error={fieldErrors.current_password}
        />
        <AuthTextField
          label="새 비밀번호"
          name="new_password"
          type="password"
          autoComplete="new-password"
          hint={`영문과 숫자를 포함해 ${PASSWORD_MIN_LENGTH}자 이상`}
          error={fieldErrors.new_password}
        />
        <AuthTextField
          label="새 비밀번호 확인"
          name="new_password_confirm"
          type="password"
          autoComplete="new-password"
          error={fieldErrors.new_password_confirm}
        />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={isSubmitting} className={getButtonClassName({ variant: 'secondary' })}>
          {isSubmitting ? '변경 중...' : '비밀번호 변경'}
        </button>
      </div>
    </form>
  );
}
