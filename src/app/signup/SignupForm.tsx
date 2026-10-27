'use client';

import { useState } from 'react';

import Link from 'next/link';

import { signIn } from 'next-auth/react';

import AuthTextField from '@/components/common/AuthTextField';
import { getButtonClassName } from '@/lib/button';
import { PASSWORD_MIN_LENGTH, type SignupPayload } from '@/lib/validation/auth';

type FieldErrorMap = Partial<Record<keyof SignupPayload, string>>;

/**
 * 교사 회원가입 폼을 렌더링한다. 가입 후 바로 로그인하며, 승인 전이므로 승인 대기 화면으로 이동한다.
 */
export default function SignupForm() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 가입 정보를 제출하고 성공하면 같은 정보로 로그인한다.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const payload: SignupPayload = {
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      password_confirm: String(formData.get('password_confirm') ?? ''),
    };

    setIsSubmitting(true);
    setFieldErrors({});
    setErrorMessage(null);

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          message?: string;
          errors?: FieldErrorMap;
        } | null;

        if (errorPayload?.errors) {
          setFieldErrors(errorPayload.errors);
          return;
        }

        setErrorMessage('가입 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      const signInResult = await signIn('credentials', {
        email: payload.email,
        password: payload.password,
        redirect: false,
      });

      // 로그인까지 되면 proxy가 승인 대기 화면으로 보낸다. 로그인만 실패하면 로그인 화면에서 다시 시도하게 한다.
      window.location.assign(signInResult?.ok && !signInResult.error ? '/pending' : '/login');
    } catch {
      setErrorMessage('요청을 처리하지 못했습니다. 네트워크 상태를 확인해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <AuthTextField label="이름" name="name" autoComplete="name" maxLength={30} error={fieldErrors.name} required />
      <AuthTextField
        label="이메일 (로그인 아이디)"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={fieldErrors.email}
        required
      />
      <AuthTextField
        label="비밀번호"
        name="password"
        type="password"
        autoComplete="new-password"
        hint={`영문과 숫자를 포함해 ${PASSWORD_MIN_LENGTH}자 이상`}
        error={fieldErrors.password}
        required
      />
      <AuthTextField
        label="비밀번호 확인"
        name="password_confirm"
        type="password"
        autoComplete="new-password"
        error={fieldErrors.password_confirm}
        required
      />

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]"
        >
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className={getButtonClassName({ variant: 'primary', fullWidth: true, className: 'mt-2' })}
      >
        {isSubmitting ? '가입 신청 중...' : '가입 신청'}
      </button>

      <p className="text-center text-sm text-[var(--color-muted)]">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" prefetch={false} className="font-semibold text-[var(--color-primary)] hover:underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
