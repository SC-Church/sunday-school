// 로그인 실패가 반복되면 잠시 로그인을 막는 인메모리 제한기.
// 서버 인스턴스마다 따로 기록되므로 완벽한 차단은 아니지만, 한 곳에서 비밀번호를 연속으로 대입하는 공격을 늦춘다.

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_WINDOW_MS = 10 * 60 * 1000;
/** 잠겼을 때 authorize가 던지는 오류 코드. 로그인 화면이 이 값으로 안내 문구를 고른다(클라이언트에서도 import하므로 서버 모듈에 두지 않는다). */
export const LOGIN_LOCKED_ERROR = 'too_many_attempts';

type FailureRecord = {
  count: number;
  firstFailedAt: number;
};

/**
 * 키(이메일)별 로그인 실패 횟수를 관리한다. now는 테스트를 위해 주입할 수 있다.
 */
export function createLoginThrottle(now: () => number = Date.now) {
  const failuresByKey = new Map<string, FailureRecord>();

  /**
   * 기록 창(10분)이 지난 실패 기록은 지운다.
   */
  function getActiveRecord(key: string): FailureRecord | null {
    const record = failuresByKey.get(key);

    if (!record) {
      return null;
    }

    if (now() - record.firstFailedAt >= LOGIN_LOCK_WINDOW_MS) {
      failuresByKey.delete(key);
      return null;
    }

    return record;
  }

  return {
    /**
     * 실패가 허용 횟수에 도달해 잠겨 있는지 확인한다.
     */
    isLocked(key: string): boolean {
      return (getActiveRecord(key)?.count ?? 0) >= LOGIN_MAX_FAILURES;
    },

    /**
     * 로그인 실패를 기록한다.
     */
    registerFailure(key: string): void {
      const record = getActiveRecord(key);

      if (record) {
        record.count += 1;
        return;
      }

      failuresByKey.set(key, { count: 1, firstFailedAt: now() });
    },

    /**
     * 로그인 성공 시 실패 기록을 지운다.
     */
    reset(key: string): void {
      failuresByKey.delete(key);
    },
  };
}

export const loginThrottle = createLoginThrottle();
