'use client';

import { useEffect, useState } from 'react';

import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { useToast } from '@/components/common/ToastProvider';
import { getButtonClassName } from '@/lib/button';
import { AttendanceStatus } from '@/types/domain';

type AttendanceLedgerResponse = {
  studentName: string;
  schoolYearStart: number;
  schoolYearEnd: number;
  weeks: Array<{
    date: string;
    label: string;
  }>;
  statuses: Record<string, AttendanceStatus>;
};

type StudentAttendanceLedgerButtonProps = {
  studentId: string;
};

/**
 * 학생별 학사연도 출석부 모달 열기 버튼을 렌더링한다.
 */
export default function StudentAttendanceLedgerButton({ studentId }: StudentAttendanceLedgerButtonProps) {
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ledger, setLedger] = useState<AttendanceLedgerResponse | null>(null);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isModalOpen]);

  /**
   * 출석부 데이터를 조회한 뒤 모달을 연다.
   */
  async function handleOpenModal() {
    setIsModalOpen(true);

    if (ledger || isLoading) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/students/${studentId}/attendance-ledger`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('fetch_failed');
      }

      const payload = (await response.json()) as AttendanceLedgerResponse;
      setLedger(payload);
    } catch {
      showToast({
        variant: 'error',
        message: '출석부 조회에 실패했습니다.',
        description: '잠시 후 다시 시도해 주세요.',
      });
      setIsModalOpen(false);
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * 모달을 닫는다.
   */
  function handleCloseModal() {
    setIsModalOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpenModal}
        className={getButtonClassName({
          variant: 'secondary',
          size: 'sm',
        })}
      >
        출석부
      </button>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
          <button
            type="button"
            onClick={handleCloseModal}
            className="absolute inset-0"
            style={{ backgroundColor: 'rgb(var(--color-dim-rgb) / 0.62)' }}
            aria-label="출석부 모달 닫기"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-attendance-ledger-title"
            className="relative z-[81] w-full max-w-4xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="student-attendance-ledger-title" className="text-lg font-semibold text-[var(--color-text)]">
                {ledger?.studentName ?? '학생'} 출석부
              </h2>
              <button
                type="button"
                onClick={handleCloseModal}
                aria-label="닫기"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-muted)] transition hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
              >
                <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
              </button>
            </div>

            {isLoading ? (
              <div className="mt-6 flex flex-col items-center justify-center gap-3 py-6">
                <span
                  className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]"
                  aria-hidden="true"
                />
                <p className="text-sm text-[var(--color-muted)]">출석부를 불러오는 중입니다.</p>
              </div>
            ) : ledger ? (
              <>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  학사연도: {ledger.schoolYearStart}.03 ~ {ledger.schoolYearEnd}.02
                </p>
                <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--color-border)] p-3">
                  <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                    {ledger.weeks.map((week) => {
                      const isPresent = ledger.statuses[week.date] === AttendanceStatus.PRESENT;

                      return (
                        <li
                          key={week.date}
                          className={`rounded-lg border px-2 py-2 text-center text-xs font-medium ${
                            isPresent
                              ? 'border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]'
                              : 'border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                          }`}
                        >
                          <p>{week.label}</p>
                          <p className="mt-1 text-[11px]">{isPresent ? '출석' : '결석'}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
