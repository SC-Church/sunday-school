import { z } from 'zod';

import { normalizeTextValue } from '@/lib/validation/student';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignupPayload = {
  name: string;
  email: string;
  password: string;
  password_confirm: string;
};

export type PasswordChangePayload = {
  current_password: string;
  new_password: string;
  new_password_confirm: string;
};

/**
 * 이메일을 로그인 식별자로 쓰기 위해 앞뒤 공백을 지우고 소문자로 맞춘다.
 */
export function normalizeEmail(value: unknown): string {
  return normalizeTextValue(value).toLowerCase();
}

/**
 * 비밀번호 입력값을 문자열로 받는다. 비밀번호는 공백도 의미가 있으므로 다듬지 않는다.
 */
function readPasswordValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`)
  .max(PASSWORD_MAX_LENGTH, `비밀번호는 ${PASSWORD_MAX_LENGTH}자 이하로 입력해 주세요.`)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), '비밀번호는 영문과 숫자를 모두 포함해야 합니다.');

export const signupSchema = z
  .object({
    name: z.string().min(1, '이름을 입력해 주세요.').max(30, '이름은 30자 이하로 입력해 주세요.'),
    email: z.string().min(1, '이메일을 입력해 주세요.').regex(EMAIL_REGEX, '이메일 형식이 올바르지 않습니다.'),
    password: passwordSchema,
    password_confirm: z.string(),
  })
  .refine((value) => value.password === value.password_confirm, {
    path: ['password_confirm'],
    message: '비밀번호 확인이 일치하지 않습니다.',
  });

export const passwordChangeSchema = z
  .object({
    current_password: z.string().min(1, '현재 비밀번호를 입력해 주세요.'),
    new_password: passwordSchema,
    new_password_confirm: z.string(),
  })
  .refine((value) => value.new_password === value.new_password_confirm, {
    path: ['new_password_confirm'],
    message: '새 비밀번호 확인이 일치하지 않습니다.',
  })
  .refine((value) => value.current_password !== value.new_password, {
    path: ['new_password'],
    message: '새 비밀번호가 현재 비밀번호와 같습니다.',
  });

/**
 * 회원가입 요청 본문을 정규화한 뒤 검증한다.
 */
export function parseSignupInput(payload: Partial<SignupPayload>) {
  return signupSchema.safeParse({
    name: normalizeTextValue(payload.name),
    email: normalizeEmail(payload.email),
    password: readPasswordValue(payload.password),
    password_confirm: readPasswordValue(payload.password_confirm),
  });
}

/**
 * 비밀번호 변경 요청 본문을 검증한다.
 */
export function parsePasswordChangeInput(payload: Partial<PasswordChangePayload>) {
  return passwordChangeSchema.safeParse({
    current_password: readPasswordValue(payload.current_password),
    new_password: readPasswordValue(payload.new_password),
    new_password_confirm: readPasswordValue(payload.new_password_confirm),
  });
}
