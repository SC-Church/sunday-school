import { z } from 'zod';

import { Gender, Relationship } from '@/types/domain';

const PHONE_NUMBER_REGEX = /^010-\d{4}-\d{4}$/;
const INVALID_PHONE_MARKER = '__INVALID_PHONE__';

export const STUDENT_FIELD_LABELS: Record<string, string> = {
  name: '이름',
  gender: '성별',
  birth_date: '생년월일',
  address: '주소',
  phone: '전화번호',
  guardian_name: '보호자 성함',
  guardian_relationship: '보호자 관계',
  guardian_phone: '보호자 전화번호',
  class_id: '반',
  note: '특이사항',
  is_new_friend: '새친구',
  first_visit_date: '첫 방문일',
};

export const STUDENT_NOTE_MAX_LENGTH = 500;

export type StudentInputPayload = {
  name: string;
  gender: string;
  birth_date: string;
  address: string;
  phone: string;
  guardian_name: string;
  guardian_relationship: string;
  guardian_phone: string;
  /** 배정할 반 id. 빈 문자열이면 미배정 */
  class_id?: string;
  note?: string;
  is_new_friend?: boolean;
  first_visit_date?: string;
};

/**
 * 문자열 입력값의 앞뒤 공백을 제거한다.
 */
export function normalizeTextValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 전화번호 입력값을 숫자 기준으로 010-0000-0000 형식으로 변환한다.
 * 형식에 맞지 않으면 검증 단계에서 걸러지도록 표식 문자열을 반환한다.
 */
export function normalizePhoneValue(value: unknown): string {
  const onlyDigits = (typeof value === 'string' ? value : '').replace(/\D/g, '');

  if (!onlyDigits) {
    return '';
  }

  if (!/^010\d{8}$/.test(onlyDigits)) {
    return INVALID_PHONE_MARKER;
  }

  return `${onlyDigits.slice(0, 3)}-${onlyDigits.slice(3, 7)}-${onlyDigits.slice(7, 11)}`;
}

export const studentInputSchema = z
  .object({
    name: z.string().trim().min(1, '이름을 입력해 주세요.'),
    gender: z
      .string()
      .refine((value) => Object.values(Gender).includes(value as Gender), '성별을 선택해 주세요.')
      .transform((value) => value as Gender),
    birth_date: z.string().trim().min(1, '생년월일을 입력해 주세요.'),
    address: z.string().trim().min(1, '주소를 입력해 주세요.'),
    phone: z
      .string()
      .trim()
      .refine((value) => !value || PHONE_NUMBER_REGEX.test(value), '전화번호는 010-0000-0000 형식으로 입력해 주세요.')
      .optional(),
    guardian_name: z.string().trim().optional(),
    guardian_relationship: z.preprocess((value) => {
      if (typeof value !== 'string') {
        return undefined;
      }

      const trimmedValue = value.trim();
      return trimmedValue === '' ? undefined : trimmedValue;
    }, z.nativeEnum(Relationship).optional()),
    guardian_phone: z
      .string()
      .trim()
      .refine(
        (value) => !value || PHONE_NUMBER_REGEX.test(value),
        '보호자 전화번호는 010-0000-0000 형식으로 입력해 주세요.'
      )
      .optional(),
    class_id: z.string().trim().optional(),
    note: z
      .string()
      .trim()
      .max(STUDENT_NOTE_MAX_LENGTH, `특이사항은 ${STUDENT_NOTE_MAX_LENGTH}자 이하로 입력해 주세요.`),
    is_new_friend: z.boolean(),
    first_visit_date: z
      .string()
      .trim()
      .refine((value) => !value || parseKstBirthDate(value) !== null, '첫 방문일 형식이 올바르지 않습니다.'),
  })
  .superRefine((value, ctx) => {
    const hasAnyGuardianField = Boolean(value.guardian_name || value.guardian_relationship || value.guardian_phone);
    const hasAllGuardianFields = Boolean(value.guardian_name && value.guardian_relationship && value.guardian_phone);

    if (hasAnyGuardianField && !hasAllGuardianFields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['guardian_name'],
        message: '보호자 정보는 이름/관계/전화번호를 모두 입력해 주세요.',
      });
    }
  });

export type StudentInput = z.infer<typeof studentInputSchema>;

/**
 * 요청 본문을 정규화한 뒤 학생 입력값 스키마로 검증한다.
 */
export function parseStudentInput(payload: Partial<StudentInputPayload>) {
  return studentInputSchema.safeParse({
    name: normalizeTextValue(payload.name),
    gender: normalizeTextValue(payload.gender),
    birth_date: normalizeTextValue(payload.birth_date),
    address: normalizeTextValue(payload.address),
    phone: normalizePhoneValue(payload.phone),
    guardian_name: normalizeTextValue(payload.guardian_name),
    guardian_relationship: normalizeTextValue(payload.guardian_relationship),
    guardian_phone: normalizePhoneValue(payload.guardian_phone),
    class_id: normalizeTextValue(payload.class_id),
    note: normalizeTextValue(payload.note),
    is_new_friend: normalizeBooleanValue(payload.is_new_friend),
    first_visit_date: normalizeTextValue(payload.first_visit_date),
  });
}

/**
 * 체크박스/JSON 불리언 입력값을 boolean으로 정규화한다(true, 'true', 'on'만 참).
 */
export function normalizeBooleanValue(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on';
}

/**
 * zod 검증 실패 결과를 필드별 한글 오류 메시지 맵으로 변환한다.
 */
export function toFieldErrorMap(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  error.issues.forEach((issue) => {
    const fieldKey = String(issue.path[0] ?? '');

    if (fieldKey && !fieldErrors[fieldKey]) {
      fieldErrors[fieldKey] = issue.message;
    }
  });

  return fieldErrors;
}

/**
 * 한국시간 자정 기준 생년월일 Date 값을 만든다. 형식이 잘못되면 null을 반환한다.
 */
export function parseKstBirthDate(birthDateText: string): Date | null {
  const birthDate = new Date(`${birthDateText}T00:00:00+09:00`);

  return Number.isNaN(birthDate.getTime()) ? null : birthDate;
}
