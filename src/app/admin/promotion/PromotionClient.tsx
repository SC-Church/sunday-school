'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import ActionModal, { type ActionModalButton } from '@/components/common/ActionModal';
import { useToast } from '@/components/common/ToastProvider';
import { getButtonClassName } from '@/lib/button';
import { suggestTargetClass } from '@/lib/promotion';

type ClassView = {
  id: string;
  departmentId: string;
  departmentName: string;
  name: string;
  sortOrder: number;
  activeStudentCount: number;
};

export type PromotionViewModel = {
  currentSchoolYear: number;
  sourceYear: number;
  targetYear: number;
  availableSchoolYears: number[];
  departments: Array<{ id: string; name: string; sortOrder: number }>;
  sourceClasses: ClassView[];
  targetClasses: ClassView[];
  /** 새 학년도에 이미 배정된 학생 수(진급을 이미 실행했는지 가늠) */
  alreadyPromotedCount: number;
};

type PromotionClientProps = {
  viewModel: PromotionViewModel;
};

type PromotionResult = {
  promoted_count: number;
  ended_only_count: number;
  skipped_count: number;
};

const INPUT_CLASS_NAME =
  'rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]';

/**
 * 학년 진급 마법사(학년도 선택 → 반 구조 준비 → 매핑 확인 → 실행)를 렌더링한다.
 */
export default function PromotionClient({ viewModel }: PromotionClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [result, setResult] = useState<PromotionResult | null>(null);
  const suggestedMapping = useMemo(
    () =>
      Object.fromEntries(
        viewModel.sourceClasses.map((sourceClass) => [
          sourceClass.id,
          suggestTargetClass(sourceClass, viewModel.targetClasses, viewModel.departments)?.id ?? '',
        ])
      ),
    [viewModel.sourceClasses, viewModel.targetClasses, viewModel.departments]
  );
  const [targetBySourceClassId, setTargetBySourceClassId] = useState<Record<string, string>>(suggestedMapping);

  const totalStudentCount = viewModel.sourceClasses.reduce(
    (sum, sourceClass) => sum + sourceClass.activeStudentCount,
    0
  );
  const graduatingCount = viewModel.sourceClasses
    .filter((sourceClass) => !targetBySourceClassId[sourceClass.id])
    .reduce((sum, sourceClass) => sum + sourceClass.activeStudentCount, 0);

  /**
   * 학년도 선택을 바꾼다(URL로 서버 데이터를 다시 읽는다).
   */
  function handleChangeYears(sourceYear: number, targetYear: number) {
    router.push(`/admin/promotion?source_year=${sourceYear}&target_year=${targetYear}`);
  }

  /**
   * 이전 학년도 반 구조를 새 학년도로 복사한다.
   */
  async function handleCopyClasses() {
    setIsBusy(true);
    try {
      const response = await fetch('/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'copy_from_year',
          source_school_year: viewModel.sourceYear,
          school_year: viewModel.targetYear,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { copied_count?: number; detail?: string } | null;

      if (!response.ok) {
        showToast({ variant: 'error', message: '반 구조를 복사하지 못했습니다.', description: payload?.detail });
        return;
      }

      showToast({
        variant: 'success',
        message: `${payload?.copied_count ?? 0}개 반을 ${viewModel.targetYear}학년도에 만들었습니다.`,
      });
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  }

  /**
   * 진급을 실행한다.
   */
  async function handleRunPromotion() {
    setIsConfirmOpen(false);
    setIsBusy(true);

    try {
      const response = await fetch('/api/admin/promotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          source_school_year: viewModel.sourceYear,
          target_school_year: viewModel.targetYear,
          mappings: viewModel.sourceClasses.map((sourceClass) => ({
            source_class_id: sourceClass.id,
            target_class_id: targetBySourceClassId[sourceClass.id] || null,
          })),
        }),
      });
      const payload = (await response.json().catch(() => null)) as (PromotionResult & { detail?: string }) | null;

      if (!response.ok || !payload) {
        showToast({
          variant: 'error',
          message: '진급을 실행하지 못했습니다.',
          description: payload?.detail ?? '잠시 후 다시 시도해 주세요.',
        });
        return;
      }

      setResult(payload);
      showToast({ variant: 'success', message: `${payload.promoted_count}명을 진급시켰습니다.` });
      router.refresh();
    } catch {
      showToast({
        variant: 'error',
        message: '요청을 처리하지 못했습니다.',
        description: '네트워크 상태를 확인해 주세요.',
      });
    } finally {
      setIsBusy(false);
    }
  }

  const confirmButtons: ActionModalButton[] = [
    { label: '취소', tone: 'neutral', variant: 'outline', autoClose: true },
    { label: '진급 실행', tone: 'primary', variant: 'solid', onClick: () => void handleRunPromotion() },
  ];

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6">
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">학년 진급</h1>
          <Link
            href="/admin/organization"
            prefetch={false}
            className={getButtonClassName({ variant: 'secondary', size: 'sm' })}
          >
            ← 조직 관리
          </Link>
        </div>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          이전 학년도 반의 학생을 새 학년도 반으로 한 번에 옮깁니다. 학생 정보·출석·달란트는 그대로 이어지고, 이전 반은
          이력으로 남습니다. 새 학년도(3월)가 시작되면 앱이 자동으로 새 학년도를 기준으로 삼습니다.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-[var(--color-text)]">이전 학년도</span>
            <select
              value={viewModel.sourceYear}
              onChange={(event) => handleChangeYears(Number(event.target.value), Number(event.target.value) + 1)}
              className={INPUT_CLASS_NAME}
            >
              {viewModel.availableSchoolYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[var(--color-muted)]">→</span>
          <label className="flex items-center gap-2">
            <span className="text-[var(--color-text)]">새 학년도</span>
            <select
              value={viewModel.targetYear}
              onChange={(event) => handleChangeYears(viewModel.sourceYear, Number(event.target.value))}
              className={INPUT_CLASS_NAME}
            >
              {viewModel.availableSchoolYears
                .filter((year) => year > viewModel.sourceYear)
                .concat(
                  viewModel.availableSchoolYears.includes(viewModel.sourceYear + 1) ? [] : [viewModel.sourceYear + 1]
                )
                .sort((a, b) => a - b)
                .map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">1. 새 학년도 반 준비</h2>
        {viewModel.targetClasses.length === 0 ? (
          <div className="mt-2 text-sm text-[var(--color-muted)]">
            {viewModel.targetYear}학년도에 반이 없습니다. 이전 학년도와 같은 구조로 만든 뒤 조직 관리에서 이름·담당
            교사를 다듬을 수 있습니다.
            <div className="mt-2">
              <button
                type="button"
                onClick={() => void handleCopyClasses()}
                disabled={isBusy}
                className={getButtonClassName({ variant: 'primary', size: 'sm' })}
              >
                {isBusy ? '복사 중...' : `${viewModel.sourceYear}학년도 반 구조 복사`}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {viewModel.targetYear}학년도 반 {viewModel.targetClasses.length}개가 준비되어 있습니다.
            {viewModel.alreadyPromotedCount > 0
              ? ` 이미 ${viewModel.alreadyPromotedCount}명이 배정되어 있어, 그 학생들은 건너뜁니다.`
              : ''}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">2. 반 매핑 확인</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          이름의 숫자 +1(예: 3학년 → 4학년), 부서 마지막 학년은 다음 부서 첫 반으로 자동 제안했습니다. 필요하면 바꾸고,
          졸업은 &quot;배정 안 함&quot;으로 두세요.
        </p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface-soft)]">
              <tr>
                <th className="px-3 py-2 font-semibold text-[var(--color-text)]">{viewModel.sourceYear}학년도 반</th>
                <th className="px-3 py-2 font-semibold text-[var(--color-text)]">학생</th>
                <th className="px-3 py-2 font-semibold text-[var(--color-text)]">→ {viewModel.targetYear}학년도 반</th>
              </tr>
            </thead>
            <tbody>
              {viewModel.sourceClasses.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-3 text-[var(--color-muted)]">
                    {viewModel.sourceYear}학년도에 반이 없습니다.
                  </td>
                </tr>
              ) : (
                viewModel.sourceClasses.map((sourceClass) => (
                  <tr key={sourceClass.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 text-[var(--color-text)]">
                      {sourceClass.departmentName} {sourceClass.name}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">{sourceClass.activeStudentCount}명</td>
                    <td className="px-3 py-2">
                      <select
                        value={targetBySourceClassId[sourceClass.id] ?? ''}
                        onChange={(event) =>
                          setTargetBySourceClassId((previous) => ({
                            ...previous,
                            [sourceClass.id]: event.target.value,
                          }))
                        }
                        className={INPUT_CLASS_NAME}
                        aria-label={`${sourceClass.name} 진급 대상 반`}
                      >
                        <option value="">배정 안 함 (졸업/미배정)</option>
                        {viewModel.targetClasses.map((targetClass) => (
                          <option key={targetClass.id} value={targetClass.id}>
                            {targetClass.departmentName} {targetClass.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">3. 실행</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          대상 {totalStudentCount}명 중 {totalStudentCount - graduatingCount}명이 새 반으로 옮겨지고, {graduatingCount}
          명은 배정 없이 종료(졸업)됩니다. 진급은 두 번 실행해도 이미 옮긴 학생은 건너뜁니다.
        </p>
        <div className="mt-3">
          <button
            type="button"
            disabled={isBusy || viewModel.sourceClasses.length === 0 || totalStudentCount === 0}
            onClick={() => setIsConfirmOpen(true)}
            className={getButtonClassName({ variant: 'primary' })}
          >
            {isBusy ? '실행 중...' : '진급 실행'}
          </button>
        </div>
        {result ? (
          <div className="mt-4 rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary-soft)] p-4 text-sm text-[var(--color-text)]">
            <p className="font-semibold">진급 결과</p>
            <ul className="mt-2 list-disc pl-5">
              <li>새 반으로 이동: {result.promoted_count}명</li>
              <li>배정 없이 종료(졸업): {result.ended_only_count}명</li>
              <li>이미 배정되어 건너뜀: {result.skipped_count}명</li>
            </ul>
          </div>
        ) : null}
      </section>

      <ActionModal
        isOpen={isConfirmOpen}
        title="학년 진급 실행"
        message={`${viewModel.sourceYear}학년도 → ${viewModel.targetYear}학년도로 ${totalStudentCount}명을 처리합니다.\n실행 후에는 조직 관리에서 개별로 되돌려야 합니다. 진행할까요?`}
        buttons={confirmButtons}
        onClose={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}
