import { describe, expect, it } from 'vitest';

import {
  churchNameSchema,
  groupNameSchema,
  parseSchoolYearParam,
  schoolYearSchema,
} from '@/lib/validation/organization';

describe('organization validation', () => {
  it('교회·부서·반 이름은 공백을 지우고 길이를 제한한다', () => {
    expect(churchNameSchema.parse('  송촌장로교회 ')).toBe('송촌장로교회');
    expect(churchNameSchema.safeParse('   ').success).toBe(false);
    expect(groupNameSchema.safeParse('가'.repeat(21)).success).toBe(false);
  });

  it('학년도는 문자열도 정수로 받고 범위를 검사한다', () => {
    expect(schoolYearSchema.parse('2026')).toBe(2026);
    expect(schoolYearSchema.safeParse('2026.5').success).toBe(false);
    expect(schoolYearSchema.safeParse(1999).success).toBe(false);
  });

  it('parseSchoolYearParam은 잘못된 값이면 기본값을 쓴다', () => {
    expect(parseSchoolYearParam('2025', 2026)).toBe(2025);
    expect(parseSchoolYearParam(['2024', '2025'], 2026)).toBe(2024);
    expect(parseSchoolYearParam('abc', 2026)).toBe(2026);
    expect(parseSchoolYearParam(undefined, 2026)).toBe(2026);
  });
});
