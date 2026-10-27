/**
 * 페이지 공통 로딩 스켈레톤을 렌더링한다.
 */
export default function PageSkeleton() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6" aria-busy="true" aria-live="polite">
      <section className="mx-auto w-full max-w-5xl animate-pulse rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <div className="h-7 w-40 rounded-lg bg-[var(--color-surface-soft)]" />
        <div className="mt-3 h-4 w-64 rounded bg-[var(--color-surface-soft)]" />
        <div className="mt-6 flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="h-8 w-20 rounded-full bg-[var(--color-surface-soft)]" />
          ))}
        </div>
        <div className="mt-6 grid gap-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="h-12 rounded-xl bg-[var(--color-surface-soft)]" />
          ))}
        </div>
        <p className="sr-only">불러오는 중입니다.</p>
      </section>
    </main>
  );
}
