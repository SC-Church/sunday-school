import { describe, expect, it } from 'vitest';

import { LOGIN_LOCK_WINDOW_MS, LOGIN_MAX_FAILURES, createLoginThrottle } from '@/lib/login-throttle';

describe('createLoginThrottle', () => {
  it('허용 횟수 전까지는 잠그지 않고, 도달하면 잠근다', () => {
    const throttle = createLoginThrottle(() => 0);

    for (let count = 1; count < LOGIN_MAX_FAILURES; count += 1) {
      throttle.registerFailure('a@x.com');
      expect(throttle.isLocked('a@x.com')).toBe(false);
    }

    throttle.registerFailure('a@x.com');
    expect(throttle.isLocked('a@x.com')).toBe(true);
  });

  it('다른 이메일의 실패는 서로 영향을 주지 않는다', () => {
    const throttle = createLoginThrottle(() => 0);

    for (let count = 0; count < LOGIN_MAX_FAILURES; count += 1) {
      throttle.registerFailure('a@x.com');
    }

    expect(throttle.isLocked('b@x.com')).toBe(false);
  });

  it('첫 실패 후 잠금 시간이 지나면 다시 로그인할 수 있다', () => {
    let currentTime = 0;
    const throttle = createLoginThrottle(() => currentTime);

    for (let count = 0; count < LOGIN_MAX_FAILURES; count += 1) {
      throttle.registerFailure('a@x.com');
    }

    currentTime = LOGIN_LOCK_WINDOW_MS - 1;
    expect(throttle.isLocked('a@x.com')).toBe(true);

    currentTime = LOGIN_LOCK_WINDOW_MS;
    expect(throttle.isLocked('a@x.com')).toBe(false);
  });

  it('로그인에 성공하면 실패 기록을 지운다', () => {
    const throttle = createLoginThrottle(() => 0);

    for (let count = 0; count < LOGIN_MAX_FAILURES - 1; count += 1) {
      throttle.registerFailure('a@x.com');
    }

    throttle.reset('a@x.com');
    throttle.registerFailure('a@x.com');
    expect(throttle.isLocked('a@x.com')).toBe(false);
  });
});
