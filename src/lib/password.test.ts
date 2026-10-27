import { describe, expect, it } from 'vitest';

import { DUMMY_PASSWORD_HASH, generateTemporaryPassword, hashPassword, verifyPassword } from '@/lib/password';
import { parsePasswordChangeInput } from '@/lib/validation/auth';

describe('hashPassword / verifyPassword', () => {
  it('해시한 비밀번호는 같은 비밀번호로만 검증된다', async () => {
    const storedHash = await hashPassword('sunday2026');

    expect(await verifyPassword('sunday2026', storedHash)).toBe(true);
    expect(await verifyPassword('sunday2027', storedHash)).toBe(false);
  });

  it('같은 비밀번호라도 salt가 달라 해시가 매번 다르다', async () => {
    expect(await hashPassword('sunday2026')).not.toBe(await hashPassword('sunday2026'));
  });

  it('해시 문자열에 알고리즘과 파라미터를 함께 저장하고 평문은 담지 않는다', async () => {
    const storedHash = await hashPassword('sunday2026');

    expect(storedHash.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(storedHash).not.toContain('sunday2026');
  });

  it('형식이 잘못된 해시는 예외 없이 불일치로 처리한다', async () => {
    expect(await verifyPassword('sunday2026', '')).toBe(false);
    expect(await verifyPassword('sunday2026', 'plain-text')).toBe(false);
    expect(await verifyPassword('sunday2026', 'scrypt$abc$8$1$AAAA$AAAA')).toBe(false);
  });

  it('가짜 해시는 어떤 비밀번호와도 일치하지 않는다', async () => {
    expect(await verifyPassword('', DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await verifyPassword('sunday2026', DUMMY_PASSWORD_HASH)).toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  it('10자리이며 혼동 문자(0, 1, o, l, i)를 쓰지 않는다', () => {
    for (let index = 0; index < 50; index += 1) {
      const temporaryPassword = generateTemporaryPassword();

      expect(temporaryPassword).toHaveLength(10);
      expect(temporaryPassword).not.toMatch(/[01oli]/);
    }
  });

  it('항상 비밀번호 규칙(영문+숫자 포함)을 만족한다', () => {
    for (let index = 0; index < 50; index += 1) {
      const temporaryPassword = generateTemporaryPassword();
      const result = parsePasswordChangeInput({
        current_password: 'previous-password1',
        new_password: temporaryPassword,
        new_password_confirm: temporaryPassword,
      });

      expect(result.success).toBe(true);
    }
  });
});
