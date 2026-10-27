'use client';

import { useState } from 'react';

import Link from 'next/link';

import { signIn } from 'next-auth/react';

import AuthTextField from '@/components/common/AuthTextField';
import { getButtonClassName } from '@/lib/button';
import { LOGIN_LOCKED_ERROR, LOGIN_LOCK_WINDOW_MS } from '@/lib/login-throttle';

type LoginFormProps = {
  callbackUrl: string;
};

/**
 * 이메일/비밀번호 로그인 폼을 렌더링한다.
 */
export default function LoginForm({ callbackUrl }: LoginFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 입력한 이메일/비밀번호로 로그인하고 성공하면 요청했던 화면으로 이동한다.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    if (!email || !password) {
      setErrorMessage('이메일과 비밀번호를 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await signIn('credentials', { email, password, redirect: false });

      if (!result || result.error) {
        setErrorMessage(
          result?.error === LOGIN_LOCKED_ERROR
            ? `로그인 실패가 반복되어 잠시 잠겼습니다. ${LOGIN_LOCK_WINDOW_MS / 60000}분 뒤 다시 시도해 주세요.`
            : '이메일 또는 비밀번호가 올바르지 않습니다.'
        );
        return;
      }

      // 새 세션 쿠키로 서버 화면과 proxy 가드를 다시 거치도록 전체 이동한다(승인 대기면 /pending으로 이동됨).
      window.location.assign(callbackUrl);
    } catch {
      setErrorMessage('요청을 처리하지 못했습니다. 네트워크 상태를 확인해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <AuthTextField label="이메일" name="email" type="email" autoComplete="email" inputMode="email" required />
      <AuthTextField label="비밀번호" name="password" type="password" autoComplete="current-password" required />

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
        {isSubmitting ? '로그인 중...' : '로그인'}
      </button>

      <p className="text-center text-sm text-[var(--color-muted)]">
        계정이 없으신가요?{' '}
        <Link href="/signup" prefetch={false} className="font-semibold text-[var(--color-primary)] hover:underline">
          회원가입
        </Link>
      </p>
      <p className="text-center text-xs text-[var(--color-muted)]">
        비밀번호를 잊으셨다면 관리자에게 비밀번호 초기화를 요청해 주세요.
      </p>
    </form>
  );
}
