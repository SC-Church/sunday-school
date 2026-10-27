import { z } from 'zod';

// 조직 관리(교회 이름, 부서, 반, 학년도) 입력 검증.

export const CHURCH_NAME_MAX_LENGTH = 40;
export const GROUP_NAME_MAX_LENGTH = 20;
const SCHOOL_YEAR_MIN = 2000;
const SCHOOL_YEAR_MAX = 2100;

export const churchNameSchema = z
  .string()
  .trim()
  .min(1, '교회 이름을 입력해 주세요.')
  .max(CHURCH_NAME_MAX_LENGTH, `교회 이름은 ${CHURCH_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`);

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, '이름을 입력해 주세요.')
  .max(GROUP_NAME_MAX_LENGTH, `이름은 ${GROUP_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`);

export const schoolYearSchema = z.coerce
  .number()
  .int('학년도는 정수여야 합니다.')
  .min(SCHOOL_YEAR_MIN, '학년도 범위를 벗어났습니다.')
  .max(SCHOOL_YEAR_MAX, '학년도 범위를 벗어났습니다.');

export const idSchema = z.string().trim().min(1, '대상을 선택해 주세요.');

export const teacherIdsSchema = z.array(z.string().trim().min(1)).max(10, '담당 교사는 10명까지 지정할 수 있습니다.');

/**
 * 쿼리스트링의 학년도 값을 읽는다. 없거나 잘못되면 fallback을 쓴다.
 */
export function parseSchoolYearParam(value: string | string[] | undefined, fallback: number): number {
  const resolved = Array.isArray(value) ? value[0] : value;
  const parsed = schoolYearSchema.safeParse(resolved);
  return parsed.success ? parsed.data : fallback;
}
