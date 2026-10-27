import type { ReactNode } from 'react';

type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
};

/**
 * 로그인/회원가입 화면에서 쓰는 가운데 정렬 카드 레이아웃을 렌더링한다.
 */
export default function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <main className="relative grid min-h-[calc(100dvh-var(--header-height-mobile))] place-items-center overflow-hidden bg-[var(--color-surface-soft)] px-4 py-6 sm:min-h-[calc(100dvh-var(--header-height-desktop))] sm:py-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-[rgb(var(--color-primary-rgb)/0.2)] blur-3xl" />
        <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-[rgb(var(--color-primary-rgb)/0.14)] blur-3xl" />
      </div>

      <section className="relative w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-6 shadow-xl backdrop-blur sm:p-8">
        <h1 className="text-center text-2xl font-bold text-[var(--color-text)] sm:text-3xl">{title}</h1>
        <p className="mt-3 text-center text-sm text-[var(--color-muted)]">{description}</p>

        <div className="mt-8">{children}</div>
      </section>
    </main>
  );
}
