import type { ReactNode } from 'react';

import Link from 'next/link';

import {
  CLASS_SCOPE_ALL,
  CLASS_SCOPE_UNASSIGNED,
  type ClassScope,
  getGradeDisplayLabel,
} from '@/lib/attendance-display';
import { sortStudentsByGradeDescThenName } from '@/lib/student-sort';
import { formatDateToKoreanYmd } from '@/utils/date';
import { type StudentGradeLabel, getGradeLabelByBirthDateInKst } from '@/utils/grade';

import StudentAttendanceLedgerButton from './StudentAttendanceLedgerButton';
import StudentDetailButton from './StudentDetailButton';

export type StudentInput = {
  id: string;
  name: string;
  gender: 'MALE' | 'FEMALE';
  birthDate: Date;
  address: string;
  phone: string | null;
  currentTalent: number;
  guardianContact: {
    name: string;
    relationship: 'FATHER' | 'MOTHER' | 'GRANDFATHER' | 'GRANDMOTHER' | 'ETC';
    phone: string;
  } | null;
  /** 현재 학년도 배정 반(없으면 null) */
  classId: string | null;
  className: string | null;
  departmentName: string | null;
  isNewFriend: boolean;
  note: string | null;
};

export type ClassFilterGroup = {
  departmentId: string;
  departmentName: string;
  classes: Array<{ id: string; name: string; studentCount: number }>;
};

type StudentRow = StudentInput & {
  gradeLabel: StudentGradeLabel;
};

type StudentsViewProps = {
  students: StudentInput[];
  classGroups: ClassFilterGroup[];
  selectedScope: ClassScope;
  schoolYear: number;
  isAdmin: boolean;
  /** 등록·수정·출석부 같은 쓰기 진입점을 노출할지 여부. 게스트 화면에서는 false. */
  canManage: boolean;
  /** 반 칩 링크의 기준 경로. 실데이터 화면은 /students, 게스트 화면은 /guest/students. */
  basePath: string;
  /** 관리자 전용 달란트 초기화 버튼. 실데이터 화면에서만 전달한다. */
  talentResetSlot?: ReactNode;
};

const CHIP_BASE_CLASS_NAME =
  'inline-flex items-center justify-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition';
const CHIP_SELECTED_CLASS_NAME =
  'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]';
const CHIP_IDLE_CLASS_NAME =
  'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-soft)]';

/**
 * 성별 코드를 한글 라벨로 변환한다.
 */
function getGenderLabel(gender: 'MALE' | 'FEMALE'): string {
  return gender === 'MALE' ? '남' : '여';
}

/**
 * 보호자 관계 코드를 한글 라벨로 변환한다.
 */
function getRelationshipLabel(relationship: 'FATHER' | 'MOTHER' | 'GRANDFATHER' | 'GRANDMOTHER' | 'ETC'): string {
  const labelByRelationship = {
    FATHER: '부',
    MOTHER: '모',
    GRANDFATHER: '조부',
    GRANDMOTHER: '조모',
    ETC: '기타',
  } as const;
  return labelByRelationship[relationship];
}

/**
 * 학생 이름과 새친구 표시를 렌더링한다.
 */
function StudentName({ student }: { student: StudentRow }) {
  return (
    <>
      {student.name}
      {student.isNewFriend ? (
        <span className="ml-1.5 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs text-[var(--color-primary)]">
          새친구
        </span>
      ) : null}
    </>
  );
}

/**
 * 학생 상세 모달 버튼을 렌더링한다.
 */
function DetailButton({ student, canManage }: { student: StudentRow; canManage: boolean }) {
  return (
    <StudentDetailButton
      name={student.name}
      gradeLabel={getGradeDisplayLabel(student)}
      className={student.className ? `${student.departmentName ?? ''} ${student.className}`.trim() : '미배정'}
      genderLabel={getGenderLabel(student.gender)}
      birthDateText={formatDateToKoreanYmd(student.birthDate)}
      address={student.address || '-'}
      phone={student.phone ?? '-'}
      currentTalent={student.currentTalent}
      guardianName={student.guardianContact?.name ?? '-'}
      relationshipLabel={
        student.guardianContact?.relationship ? getRelationshipLabel(student.guardianContact.relationship) : '-'
      }
      guardianPhone={student.guardianContact?.phone ?? '-'}
      note={canManage ? student.note : null}
    />
  );
}

/**
 * 학생 모바일 카드 목록을 렌더링한다.
 */
function StudentCardList({ students, canManage }: { students: StudentRow[]; canManage: boolean }) {
  if (students.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--color-border)] px-3 py-3 text-center text-sm text-[var(--color-muted)]">
        표시할 학생이 없습니다.
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {students.map((student) => (
        <li key={student.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-base font-semibold text-[var(--color-text)]">
              <StudentName student={student} />
            </p>
            <p className="text-sm font-medium text-[var(--color-primary)]">{student.className ?? '미배정'}</p>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-[var(--color-muted)]">학년(참고)</dt>
            <dd className="text-right text-[var(--color-text)]">{getGradeDisplayLabel(student)}</dd>
            <dt className="text-[var(--color-muted)]">성별 / 생일</dt>
            <dd className="text-right text-[var(--color-text)]">
              {getGenderLabel(student.gender)} / {formatDateToKoreanYmd(student.birthDate)}
            </dd>
            <dt className="text-[var(--color-muted)]">전화번호</dt>
            <dd className="text-right text-[var(--color-text)]">{student.phone ?? '-'}</dd>
            <dt className="text-[var(--color-muted)]">달란트</dt>
            <dd className="text-right font-medium text-[var(--color-text)]">{student.currentTalent}</dd>
            <dt className="text-[var(--color-muted)]">보호자</dt>
            <dd className="text-right text-[var(--color-text)]">
              {student.guardianContact
                ? `${student.guardianContact.name} (${getRelationshipLabel(student.guardianContact.relationship)}) ${student.guardianContact.phone}`
                : '-'}
            </dd>
          </dl>

          <div className="mt-3 flex justify-end gap-2">
            <DetailButton student={student} canManage={canManage} />
            {canManage ? (
              <>
                <StudentAttendanceLedgerButton studentId={student.id} />
                <Link href={`/students/${student.id}/edit`} prefetch={false} className="btn btn-secondary btn-sm">
                  수정
                </Link>
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 학생 테이블을 렌더링한다.
 */
function StudentsTable({
  students,
  canManage,
  showClassColumn,
}: {
  students: StudentRow[];
  canManage: boolean;
  showClassColumn: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <table className="w-full border-collapse text-center">
        <thead className="bg-[var(--color-surface-soft)]">
          <tr>
            {showClassColumn ? <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">반</th> : null}
            <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">이름</th>
            <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">학년(참고)</th>
            <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">성별</th>
            <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">생일</th>
            <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">달란트</th>
            <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">보호자 전화번호</th>
            <th className="px-2 py-2 text-sm font-semibold text-[var(--color-text)]">관리</th>
          </tr>
        </thead>
        <tbody>
          {students.length === 0 ? (
            <tr>
              <td colSpan={showClassColumn ? 8 : 7} className="px-2 py-2 text-center text-sm text-[var(--color-muted)]">
                표시할 학생이 없습니다.
              </td>
            </tr>
          ) : (
            students.map((student) => (
              <tr key={student.id} className="border-t border-[var(--color-border)]">
                {showClassColumn ? (
                  <td className="px-2 py-2 text-sm text-[var(--color-muted)]">{student.className ?? '미배정'}</td>
                ) : null}
                <td className="px-2 py-2 text-sm font-medium text-[var(--color-text)]">
                  <StudentName student={student} />
                </td>
                <td className="px-2 py-2 text-sm text-[var(--color-muted)]">{getGradeDisplayLabel(student)}</td>
                <td className="px-2 py-2 text-sm text-[var(--color-muted)]">{getGenderLabel(student.gender)}</td>
                <td className="px-2 py-2 text-sm text-[var(--color-muted)]">
                  {formatDateToKoreanYmd(student.birthDate)}
                </td>
                <td className="px-2 py-2 text-sm font-medium text-[var(--color-text)]">{student.currentTalent}</td>
                <td className="px-2 py-2 text-sm text-[var(--color-muted)]">{student.guardianContact?.phone ?? '-'}</td>
                <td className="px-2 py-2 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <DetailButton student={student} canManage={canManage} />
                    {canManage ? (
                      <>
                        <StudentAttendanceLedgerButton studentId={student.id} />
                        <Link
                          href={`/students/${student.id}/edit`}
                          prefetch={false}
                          className="btn btn-secondary btn-sm"
                        >
                          수정
                        </Link>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 학생 목록 한 묶음(모바일 카드 + PC 테이블)을 렌더링한다.
 */
function StudentListSection({
  title,
  students,
  canManage,
  showClassColumn,
}: {
  title: string | null;
  students: StudentRow[];
  canManage: boolean;
  showClassColumn: boolean;
}) {
  return (
    <section className="mt-5">
      {title ? (
        <h2 className="mb-2 text-base font-semibold text-[var(--color-text)]">
          {title} <span className="text-sm font-normal text-[var(--color-muted)]">{students.length}명</span>
        </h2>
      ) : null}
      <div className="sm:hidden">
        <StudentCardList students={students} canManage={canManage} />
      </div>
      <div className="hidden sm:block">
        <StudentsTable students={students} canManage={canManage} showClassColumn={showClassColumn} />
      </div>
    </section>
  );
}

/**
 * 학생 관리 화면을 렌더링한다. 반 칩으로 범위를 고르고, 전체 보기에서는 부서·반별로 묶어 보여준다.
 * 데이터 조회는 하지 않으며, 학년 계산은 grade.ts의 공통 함수만 사용한다.
 */
export default function StudentsView({
  students,
  classGroups,
  selectedScope,
  schoolYear,
  isAdmin,
  canManage,
  basePath,
  talentResetSlot,
}: StudentsViewProps) {
  const rows: StudentRow[] = sortStudentsByGradeDescThenName(
    students.map((student) => ({ ...student, gradeLabel: getGradeLabelByBirthDateInKst(student.birthDate) }))
  );
  const unassignedRows = rows.filter((student) => !student.classId);
  const buildHref = (param: string) => `${basePath}?class_id=${encodeURIComponent(param)}`;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">학생 관리</h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {schoolYear}학년도 · 전체 {students.length}명
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin ? talentResetSlot : null}
              {isAdmin ? (
                <Link href="/students/import" prefetch={false} className="btn btn-secondary btn-md">
                  CSV 일괄 등록
                </Link>
              ) : null}
              <Link href="/students/new" prefetch={false} className="btn btn-primary btn-md">
                학생 등록
              </Link>
            </div>
          ) : null}
        </div>

        <nav className="mt-5 flex flex-col gap-2" aria-label="반 선택">
          {classGroups.map((group) => (
            <div key={group.departmentId} className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 text-xs font-semibold text-[var(--color-muted)]">
                {group.departmentName}
              </span>
              {group.classes.map((classOption) => {
                const isSelected = selectedScope.kind === 'class' && selectedScope.classId === classOption.id;

                return (
                  <Link
                    key={classOption.id}
                    href={buildHref(classOption.id)}
                    prefetch={false}
                    aria-current={isSelected ? 'page' : undefined}
                    className={`${CHIP_BASE_CLASS_NAME} ${isSelected ? CHIP_SELECTED_CLASS_NAME : CHIP_IDLE_CLASS_NAME}`}
                  >
                    {classOption.name}
                    <span className="text-xs text-[var(--color-muted)]">{classOption.studentCount}</span>
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-semibold text-[var(--color-muted)]">기타</span>
            {unassignedRows.length > 0 ? (
              <Link
                href={buildHref(CLASS_SCOPE_UNASSIGNED)}
                prefetch={false}
                className={`${CHIP_BASE_CLASS_NAME} ${selectedScope.kind === 'unassigned' ? CHIP_SELECTED_CLASS_NAME : CHIP_IDLE_CLASS_NAME}`}
              >
                미배정 <span className="text-xs text-[var(--color-muted)]">{unassignedRows.length}</span>
              </Link>
            ) : null}
            <Link
              href={buildHref(CLASS_SCOPE_ALL)}
              prefetch={false}
              className={`${CHIP_BASE_CLASS_NAME} ${selectedScope.kind === 'all' ? CHIP_SELECTED_CLASS_NAME : CHIP_IDLE_CLASS_NAME}`}
            >
              전체
            </Link>
          </div>
        </nav>

        {selectedScope.kind === 'class' ? (
          <StudentListSection
            title={null}
            students={rows.filter((student) => student.classId === selectedScope.classId)}
            canManage={canManage}
            showClassColumn={false}
          />
        ) : selectedScope.kind === 'unassigned' ? (
          <StudentListSection title="미배정" students={unassignedRows} canManage={canManage} showClassColumn={false} />
        ) : (
          <>
            {classGroups.flatMap((group) =>
              group.classes.map((classOption) => (
                <StudentListSection
                  key={classOption.id}
                  title={`${group.departmentName} ${classOption.name}`}
                  students={rows.filter((student) => student.classId === classOption.id)}
                  canManage={canManage}
                  showClassColumn={false}
                />
              ))
            )}
            {unassignedRows.length > 0 ? (
              <StudentListSection
                title="미배정"
                students={unassignedRows}
                canManage={canManage}
                showClassColumn={false}
              />
            ) : null}
            {classGroups.length === 0 && unassignedRows.length === 0 ? (
              <StudentListSection title={null} students={[]} canManage={canManage} showClassColumn={false} />
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
