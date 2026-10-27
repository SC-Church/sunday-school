import { describe, expect, it } from 'vitest';

import { type PromotionClassOption, extractGradeNumber, suggestTargetClass } from '@/lib/promotion';

const departments = [
  { id: 'kids', sortOrder: 1 },
  { id: 'youth', sortOrder: 2 },
  { id: 'young', sortOrder: 3 },
];

/**
 * 테스트용 반을 만든다.
 */
function makeClass(id: string, departmentId: string, name: string, sortOrder: number): PromotionClassOption {
  return { id, departmentId, name, sortOrder };
}

const targets = [
  makeClass('k-1', 'kids', '1학년', 1),
  makeClass('k-2', 'kids', '2학년', 2),
  makeClass('k-6', 'kids', '6학년', 6),
  makeClass('y-1', 'youth', '중1', 1),
  makeClass('y-3', 'youth', '중3', 3),
  makeClass('a', 'young', '청년 A', 1),
];

describe('extractGradeNumber', () => {
  it('이름의 첫 숫자를 읽고 없으면 null', () => {
    expect(extractGradeNumber('3학년')).toBe(3);
    expect(extractGradeNumber('중2')).toBe(2);
    expect(extractGradeNumber('유아부')).toBeNull();
  });
});

describe('suggestTargetClass', () => {
  it('같은 부서에서 숫자 +1인 반을 제안한다', () => {
    expect(suggestTargetClass(makeClass('s', 'kids', '1학년', 1), targets, departments)?.id).toBe('k-2');
  });

  it('부서의 마지막 학년은 다음 부서의 첫 반을 제안한다', () => {
    expect(suggestTargetClass(makeClass('s', 'kids', '6학년', 6), targets, departments)?.id).toBe('y-1');
    expect(suggestTargetClass(makeClass('s', 'youth', '중3', 3), targets, departments)?.id).toBe('a');
  });

  it('마지막 부서의 마지막 학년은 null(졸업)이다', () => {
    expect(suggestTargetClass(makeClass('s', 'young', '청년 3', 3), targets, departments)).toBeNull();
  });

  it('+1 반이 없지만 더 높은 학년이 있으면 같은 이름의 반으로 제안한다', () => {
    // 2학년 → 3학년이 없고 6학년은 있음 → 같은 이름(2학년) 유지 제안
    expect(suggestTargetClass(makeClass('s', 'kids', '2학년', 2), targets, departments)?.id).toBe('k-2');
  });

  it('숫자가 없는 반은 같은 이름의 반을 제안한다', () => {
    expect(suggestTargetClass(makeClass('s', 'young', '청년 A', 1), targets, departments)?.id).toBe('a');
    expect(suggestTargetClass(makeClass('s', 'young', '청년 B', 2), targets, departments)).toBeNull();
  });
});
