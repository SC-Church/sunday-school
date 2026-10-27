'use client';

import { useEffect, useState } from 'react';

import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { getButtonClassName } from '@/lib/button';

type StudentDetailButtonProps = {
  name: string;
  gradeLabel: string;
  /** 소속 반(부서 포함) */
  className: string;
  genderLabel: string;
  birthDateText: string;
  address: string;
  phone: string;
  currentTalent: number;
  guardianName: string;
  relationshipLabel: string;
  guardianPhone: string;
  /** 특이사항. 게스트 화면 등 노출하지 않을 때는 null */
  note: string | null;
};

/**
 * 학생 상세정보 모달 열기 버튼을 렌더링한다.
 */
export default function StudentDetailButton({
  name,
  gradeLabel,
  className,
  genderLabel,
  birthDateText,
  address,
  phone,
  currentTalent,
  guardianName,
  relationshipLabel,
  guardianPhone,
  note,
}: StudentDetailButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

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
   * 상세 모달을 연다.
   */
  function handleOpenModal() {
    setIsModalOpen(true);
  }

  /**
   * 상세 모달을 닫는다.
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
        상세
      </button>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
          <button
            type="button"
            onClick={handleCloseModal}
            className="absolute inset-0"
            style={{ backgroundColor: 'rgb(var(--color-dim-rgb) / 0.62)' }}
            aria-label="상세 모달 닫기"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-detail-modal-title"
            className="relative z-[81] w-full max-w-2xl rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-left shadow-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-left">
                <h2
                  id="student-detail-modal-title"
                  className="text-left text-lg font-semibold text-[var(--color-text)]"
                >
                  학생 상세 정보
                </h2>
                <p className="mt-0.5 text-left text-xs text-[var(--color-muted)]">
                  기본 정보와 보호자 정보를 확인할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                aria-label="닫기"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-muted)] transition hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
              >
                <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
                <h3 className="mb-3 text-center text-sm font-semibold tracking-wide text-[var(--color-muted)]">
                  학생 기본 정보
                </h3>
                <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-left text-sm">
                  <div className="contents">
                    <dt className="whitespace-nowrap text-left text-[var(--color-muted)]">이름</dt>
                    <dd className="text-left font-medium text-[var(--color-text)]">{name}</dd>
                  </div>
                  <div className="contents">
                    <dt className="whitespace-nowrap text-left text-[var(--color-muted)]">소속 반</dt>
                    <dd className="text-left font-medium text-[var(--color-text)]">{className}</dd>
                  </div>
                  <div className="contents">
                    <dt className="whitespace-nowrap text-left text-[var(--color-muted)]">학년(참고)</dt>
                    <dd className="text-left font-medium text-[var(--color-text)]">{gradeLabel}</dd>
                  </div>
                  <div className="contents">
                    <dt className="whitespace-nowrap text-left text-[var(--color-muted)]">성별</dt>
                    <dd className="text-left font-medium text-[var(--color-text)]">{genderLabel}</dd>
                  </div>
                  <div className="contents">
                    <dt className="whitespace-nowrap text-left text-[var(--color-muted)]">생일</dt>
                    <dd className="text-left font-medium text-[var(--color-text)]">{birthDateText}</dd>
                  </div>
                  <div className="contents">
                    <dt className="whitespace-nowrap text-left text-[var(--color-muted)]">달란트</dt>
                    <dd className="text-left font-medium text-[var(--color-text)]">{currentTalent}</dd>
                  </div>
                  <div className="contents">
                    <dt className="self-start whitespace-nowrap text-left text-[var(--color-muted)]">주소</dt>
                    <dd className="text-left break-words font-medium text-[var(--color-text)]">{address}</dd>
                  </div>
                </dl>
              </article>

              <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
                <h3 className="mb-3 text-center text-sm font-semibold tracking-wide text-[var(--color-muted)]">
                  연락 및 보호자
                </h3>
                <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-left text-sm">
                  <div className="contents">
                    <dt className="whitespace-nowrap text-left text-[var(--color-muted)]">전화번호</dt>
                    <dd className="text-left font-medium text-[var(--color-text)]">{phone}</dd>
                  </div>
                  <div className="contents">
                    <dt className="whitespace-nowrap text-left text-[var(--color-muted)]">보호자 성함</dt>
                    <dd className="text-left font-medium text-[var(--color-text)]">{guardianName}</dd>
                  </div>
                  <div className="contents">
                    <dt className="whitespace-nowrap text-left text-[var(--color-muted)]">관계</dt>
                    <dd className="text-left font-medium text-[var(--color-text)]">{relationshipLabel}</dd>
                  </div>
                  <div className="contents">
                    <dt className="whitespace-nowrap text-left text-[var(--color-muted)]">보호자 전화번호</dt>
                    <dd className="text-left font-medium text-[var(--color-text)]">{guardianPhone}</dd>
                  </div>
                </dl>
              </article>
              {note !== null ? (
                <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 sm:col-span-2">
                  <h3 className="mb-2 text-center text-sm font-semibold tracking-wide text-[var(--color-muted)]">
                    특이사항
                  </h3>
                  <p className="whitespace-pre-line text-left text-sm text-[var(--color-text)]">{note || '없음'}</p>
                </article>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
