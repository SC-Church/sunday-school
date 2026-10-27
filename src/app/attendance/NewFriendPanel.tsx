'use client';

import { useState } from 'react';

import RestrictedInput from '@/components/common/RestrictedInput';
import { useToast } from '@/components/common/ToastProvider';
import { getButtonClassName } from '@/lib/button';
import { Gender } from '@/types/domain';
import { formatDateToKoreanYmd } from '@/utils/date';

import CollapsiblePanel from './CollapsiblePanel';

/** 새친구가 이 횟수 이상 출석하면 정착 후보로 표시한다(서버의 NEW_FRIEND_SETTLE_THRESHOLD와 같은 값). */
const SETTLE_THRESHOLD = 4;

const INPUT_CLASS_NAME =
  'rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]';

export type SerializableNewFriendRow = {
  id: string;
  name: string;
  className: string | null;
  firstVisitDate: string | null;
  presentCount: number;
};

type ClassGroupOption = {
  departmentId: string;
  departmentName: string;
  classes: Array<{ id: string; name: string }>;
};

type NewFriendPanelProps = {
  newFriends: SerializableNewFriendRow[];
  classGroups: ClassGroupOption[];
  defaultClassId: string;
  isFormOpen: boolean;
  onToggleForm: () => void;
  /** 등록 등 서버 데이터가 바뀌어 다시 읽어야 할 때 */
  onChanged: () => void;
  /** 정착 처리를 화면에 먼저 반영할 때 */
  onSettledLocally: (studentId: string) => void;
};

type FieldErrorMap = Partial<Record<'name' | 'gender' | 'birth_date' | 'phone' | 'class_id', string>>;

/**
 * 새친구 목록(누적 출석 횟수)과 빠른 등록 폼을 렌더링한다.
 */
export default function NewFriendPanel({
  newFriends,
  classGroups,
  defaultClassId,
  isFormOpen,
  onToggleForm,
  onChanged,
  onSettledLocally,
}: NewFriendPanelProps) {
  const { showToast } = useToast();
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settlingStudentId, setSettlingStudentId] = useState<string | null>(null);

  /**
   * 새친구를 등록한다.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const readValue = (key: string) => String(formData.get(key) ?? '');

    setIsSubmitting(true);
    setFieldErrors({});

    try {
      const response = await fetch('/api/students/new-friend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name: readValue('name'),
          gender: readValue('gender'),
          birth_date: readValue('birth_date'),
          phone: readValue('phone'),
          class_id: readValue('class_id'),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        errors?: FieldErrorMap;
        student_name?: string;
      } | null;

      if (!response.ok) {
        if (payload?.errors) {
          setFieldErrors(payload.errors);
        }
        showToast({
          variant: 'error',
          message: '새친구 등록에 실패했습니다.',
          description: payload?.errors ? Object.values(payload.errors)[0] : '잠시 후 다시 시도해 주세요.',
        });
        return;
      }

      form.reset();
      showToast({ variant: 'success', message: `${payload?.student_name ?? '새친구'}를 등록했습니다.` });
      onChanged();
    } catch {
      showToast({
        variant: 'error',
        message: '요청을 처리하지 못했습니다.',
        description: '네트워크 상태를 확인해 주세요.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * 새친구를 정착 처리한다(화면 먼저 반영, 실패 시 다시 읽음).
   */
  async function handleSettle(studentId: string) {
    setSettlingStudentId(studentId);
    onSettledLocally(studentId);

    try {
      const response = await fetch(`/api/students/${studentId}/settle`, { method: 'POST', credentials: 'same-origin' });

      if (!response.ok) {
        throw new Error('settle_failed');
      }

      showToast({ variant: 'success', message: '정착 처리했습니다.' });
    } catch {
      showToast({ variant: 'error', message: '정착 처리에 실패했습니다.', description: '잠시 후 다시 시도해 주세요.' });
      onChanged();
    } finally {
      setSettlingStudentId(null);
    }
  }

  return (
    <CollapsiblePanel
      title={`새친구 (${newFriends.length})`}
      description={`새친구의 누적 출석 횟수를 보여줍니다. ${SETTLE_THRESHOLD}회 이상 출석하면 정착 처리해 주세요.`}
      storageKey="attendance_new_friend_collapsible"
    >
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={onToggleForm} className={getButtonClassName({ variant: 'primary', size: 'sm' })}>
          {isFormOpen ? '등록 폼 닫기' : '새친구 등록'}
        </button>
      </div>

      {isFormOpen ? (
        <form
          onSubmit={handleSubmit}
          className="mb-4 grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3 sm:grid-cols-5"
          noValidate
        >
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[var(--color-text)]">이름 *</span>
            <input name="name" type="text" className={INPUT_CLASS_NAME} />
            {fieldErrors.name ? <span className="text-xs text-[var(--color-danger)]">{fieldErrors.name}</span> : null}
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[var(--color-text)]">성별 *</span>
            <select name="gender" defaultValue="" className={INPUT_CLASS_NAME}>
              <option value="">선택</option>
              <option value={Gender.MALE}>남</option>
              <option value={Gender.FEMALE}>여</option>
            </select>
            {fieldErrors.gender ? (
              <span className="text-xs text-[var(--color-danger)]">{fieldErrors.gender}</span>
            ) : null}
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[var(--color-text)]">생년월일 *</span>
            <input name="birth_date" type="date" className={INPUT_CLASS_NAME} />
            {fieldErrors.birth_date ? (
              <span className="text-xs text-[var(--color-danger)]">{fieldErrors.birth_date}</span>
            ) : null}
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[var(--color-text)]">전화번호</span>
            <RestrictedInput
              filterType="phone"
              name="phone"
              type="text"
              inputMode="numeric"
              placeholder="010-0000-0000"
              maxLength={13}
              className={INPUT_CLASS_NAME}
            />
            {fieldErrors.phone ? <span className="text-xs text-[var(--color-danger)]">{fieldErrors.phone}</span> : null}
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[var(--color-text)]">반</span>
            <select name="class_id" defaultValue={defaultClassId} className={INPUT_CLASS_NAME}>
              <option value="">미배정</option>
              {classGroups.map((group) => (
                <optgroup key={group.departmentId} label={group.departmentName}>
                  {group.classes.map((classOption) => (
                    <option key={classOption.id} value={classOption.id}>
                      {classOption.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {fieldErrors.class_id ? (
              <span className="text-xs text-[var(--color-danger)]">{fieldErrors.class_id}</span>
            ) : null}
          </label>
          <div className="flex items-end justify-end sm:col-span-5">
            <button
              type="submit"
              disabled={isSubmitting}
              className={getButtonClassName({ variant: 'primary', size: 'sm' })}
            >
              {isSubmitting ? '등록 중...' : '등록'}
            </button>
          </div>
          <p className="text-xs text-[var(--color-muted)] sm:col-span-5">
            주소·보호자 정보는 나중에 [학생 관리 &gt; 수정]에서 채울 수 있습니다. 오늘이 첫 방문일로 기록됩니다.
          </p>
        </form>
      ) : null}

      {newFriends.length === 0 ? (
        <p className="rounded-xl border border-[var(--color-border)] px-3 py-3 text-center text-sm text-[var(--color-muted)]">
          이 범위에 새친구가 없습니다.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {newFriends.map((newFriend) => {
            const isSettleCandidate = newFriend.presentCount >= SETTLE_THRESHOLD;

            return (
              <li
                key={newFriend.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">
                    {newFriend.name}
                    {newFriend.className ? (
                      <span className="ml-1.5 text-xs text-[var(--color-muted)]">{newFriend.className}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                    첫 방문 {newFriend.firstVisitDate ? formatDateToKoreanYmd(new Date(newFriend.firstVisitDate)) : '-'}{' '}
                    · 출석{' '}
                    <span
                      className={`font-semibold ${isSettleCandidate ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`}
                    >
                      {newFriend.presentCount}회
                    </span>
                    {isSettleCandidate ? ' · 정착 후보' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={settlingStudentId === newFriend.id}
                  onClick={() => handleSettle(newFriend.id)}
                  className={getButtonClassName({ variant: 'secondary', size: 'sm', round: 'pill' })}
                >
                  정착 처리
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </CollapsiblePanel>
  );
}
