import type { InputHTMLAttributes } from 'react';

type AuthTextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
};

/**
 * 라벨·오류 문구가 붙은 인증 화면용 입력 필드를 렌더링한다.
 */
export default function AuthTextField({ label, name, error, hint, className = '', ...inputProps }: AuthTextFieldProps) {
  const describedById = error || hint ? `${name}-description` : undefined;

  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
      <input
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        className={`rounded-lg border bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] ${
          error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border-strong)]'
        } ${className}`}
        {...inputProps}
      />
      {error ? (
        <span id={describedById} className="text-xs text-[var(--color-danger)]">
          {error}
        </span>
      ) : hint ? (
        <span id={describedById} className="text-xs text-[var(--color-muted)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
