import { describe, expect, it } from 'vitest';

import { normalizeEmail, parsePasswordChangeInput, parseSignupInput } from '@/lib/validation/auth';
import { toFieldErrorMap } from '@/lib/validation/student';

const validSignup = {
  name: '김교사',
  email: 'Teacher@Example.com',
  password: 'sunday2026',
  password_confirm: 'sunday2026',
};

/**
 * 검증 실패 시 필드별 오류 메시지 맵을 반환한다.
 */
function signupErrors(payload: Partial<typeof validSignup>): Record<string, string> {
  const result = parseSignupInput(payload);
  return result.success ? {} : toFieldErrorMap(result.error);
}

describe('normalizeEmail', () => {
  it('앞뒤 공백을 지우고 소문자로 맞춘다', () => {
    expect(normalizeEmail('  Teacher@Example.COM ')).toBe('teacher@example.com');
  });

  it('문자열이 아니면 빈 문자열을 반환한다', () => {
    expect(normalizeEmail(undefined)).toBe('');
  });
});

describe('parseSignupInput', () => {
  it('정상 입력은 이메일을 소문자로 정규화해 통과한다', () => {
    const result = parseSignupInput(validSignup);

    expect(result.success).toBe(true);
    expect(result.success && result.data.email).toBe('teacher@example.com');
  });

  it('이름과 이메일은 필수다', () => {
    expect(signupErrors({ ...validSignup, name: '  ' }).name).toBeDefined();
    expect(signupErrors({ ...validSignup, email: '' }).email).toBeDefined();
  });

  it('이메일 형식이 아니면 거부한다', () => {
    expect(signupErrors({ ...validSignup, email: 'teacher' }).email).toBe('이메일 형식이 올바르지 않습니다.');
  });

  it('비밀번호는 8자 이상이고 영문과 숫자를 모두 포함해야 한다', () => {
    expect(signupErrors({ ...validSignup, password: 'abc123', password_confirm: 'abc123' }).password).toBeDefined();
    expect(signupErrors({ ...validSignup, password: 'abcdefgh', password_confirm: 'abcdefgh' }).password).toBeDefined();
    expect(signupErrors({ ...validSignup, password: '12345678', password_confirm: '12345678' }).password).toBeDefined();
  });

  it('비밀번호 확인이 다르면 password_confirm 오류를 낸다', () => {
    expect(signupErrors({ ...validSignup, password_confirm: 'sunday2027' }).password_confirm).toBe(
      '비밀번호 확인이 일치하지 않습니다.'
    );
  });

  it('비밀번호 앞뒤 공백은 지우지 않고 그대로 비교한다', () => {
    expect(signupErrors({ ...validSignup, password_confirm: 'sunday2026 ' }).password_confirm).toBeDefined();
  });
});

describe('parsePasswordChangeInput', () => {
  it('정상 입력은 통과한다', () => {
    expect(
      parsePasswordChangeInput({
        current_password: 'old-pass1',
        new_password: 'new-pass2',
        new_password_confirm: 'new-pass2',
      }).success
    ).toBe(true);
  });

  it('현재 비밀번호와 같은 새 비밀번호는 거부한다', () => {
    const result = parsePasswordChangeInput({
      current_password: 'same-pass1',
      new_password: 'same-pass1',
      new_password_confirm: 'same-pass1',
    });

    expect(result.success).toBe(false);
  });

  it('새 비밀번호 확인이 다르면 거부한다', () => {
    const result = parsePasswordChangeInput({
      current_password: 'old-pass1',
      new_password: 'new-pass2',
      new_password_confirm: 'new-pass3',
    });

    expect(result.success ? {} : toFieldErrorMap(result.error)).toHaveProperty('new_password_confirm');
  });
});
