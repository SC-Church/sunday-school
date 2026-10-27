import { Gender } from '@/types/domain';
import { getKoreanYear } from '@/utils/date';
import type { StudentGradeLabel } from '@/utils/grade';

// 출석 화면의 범위(반) 선택·표시 라벨 헬퍼. 클라이언트 컴포넌트에서도 import하므로 서버 전용 모듈을 import하지 않는다.

/** 출석/학생 화면의 조회 범위. 반 하나, 미배정 학생, 전체 */
export type ClassScope = { kind: 'class'; classId: string } | { kind: 'unassigned' } | { kind: 'all' };

export const CLASS_SCOPE_ALL = 'all';
export const CLASS_SCOPE_UNASSIGNED = 'unassigned';

/**
 * 쿼리스트링 class_id 값을 범위로 해석한다. 값이 없으면 null(호출 쪽에서 기본 반을 정한다).
 */
export function parseClassScope(value: string | string[] | undefined): ClassScope | null {
  const resolved = Array.isArray(value) ? value[0] : value;

  if (!resolved) {
    return null;
  }
  if (resolved === CLASS_SCOPE_ALL) {
    return { kind: 'all' };
  }
  if (resolved === CLASS_SCOPE_UNASSIGNED) {
    return { kind: 'unassigned' };
  }

  return { kind: 'class', classId: resolved };
}

/**
 * 범위를 쿼리스트링 값으로 되돌린다.
 */
export function toClassScopeParam(scope: ClassScope): string {
  if (scope.kind === 'class') {
    return scope.classId;
  }

  return scope.kind === 'all' ? CLASS_SCOPE_ALL : CLASS_SCOPE_UNASSIGNED;
}

/**
 * 성별 코드를 화면 표시용 한 글자로 변환한다.
 */
export function getGenderLabel(gender: Gender): string {
  return gender === Gender.MALE ? '남' : '여';
}

/**
 * 학년 라벨을 표시용으로 변환한다. 유아부는 연 나이를 덧붙인다.
 */
export function getGradeDisplayLabel(student: { gradeLabel: StudentGradeLabel; birthDate: Date }): string {
  if (student.gradeLabel !== '유아부') {
    return student.gradeLabel;
  }

  const currentYearInKst = getKoreanYear(new Date());
  const yearlyAge = Math.max(0, currentYearInKst - getKoreanYear(student.birthDate));
  return `유아부 (연 ${yearlyAge}세)`;
}
