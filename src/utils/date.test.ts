import { describe, expect, it } from 'vitest';

import {
  addWeeksToSunday,
  formatDateToKoreanYmd,
  formatDateToKstIsoString,
  getCurrentAgeInKst,
  getFirstSundayOfMonthKst,
  getKoreanDateParts,
  getKoreanWeekdayIndex,
  getKoreanYear,
  getLastSundayOfMonthKst,
  getSchoolYearSundays,
  getSundayOfWeekInKst,
} from '@/utils/date';

describe('formatDateToKoreanYmd', () => {
  it('UTC 자정 직전 시각을 한국시간 기준 다음 날짜로 변환한다', () => {
    // 2026-03-01T15:00:00Z = 2026-03-02 00:00 KST
    expect(formatDateToKoreanYmd(new Date('2026-03-01T15:00:00Z'))).toBe('2026-03-02');
  });

  it('한국시간 기준으로 날짜가 바뀌지 않는 시각은 같은 날짜를 반환한다', () => {
    // 2026-03-01T14:59:59Z = 2026-03-01 23:59:59 KST
    expect(formatDateToKoreanYmd(new Date('2026-03-01T14:59:59Z'))).toBe('2026-03-01');
  });

  it('연말 경계에서 한국시간 기준 연도가 넘어간다', () => {
    // 2025-12-31T15:00:00Z = 2026-01-01 00:00 KST
    expect(formatDateToKoreanYmd(new Date('2025-12-31T15:00:00Z'))).toBe('2026-01-01');
  });

  it('한 자리 월/일을 두 자리로 채운다', () => {
    expect(formatDateToKoreanYmd(new Date('2026-01-05T03:00:00Z'))).toBe('2026-01-05');
  });
});

describe('getKoreanDateParts', () => {
  it('한국시간 기준 연/월/일을 숫자로 반환한다', () => {
    expect(getKoreanDateParts(new Date('2026-03-01T15:00:00Z'))).toEqual({ year: 2026, month: 3, day: 2 });
  });
});

describe('getKoreanYear', () => {
  it('UTC 기준으로는 전년도인 시각도 한국시간 연도로 반환한다', () => {
    expect(getKoreanYear(new Date('2025-12-31T15:00:00Z'))).toBe(2026);
  });
});

describe('getCurrentAgeInKst', () => {
  const birthDate = new Date('2015-06-10T00:00:00+09:00');

  it('생일 하루 전에는 아직 나이를 올리지 않는다', () => {
    expect(getCurrentAgeInKst(birthDate, new Date('2026-06-09T00:00:00+09:00'))).toBe(10);
  });

  it('생일 당일에는 나이를 올린다', () => {
    expect(getCurrentAgeInKst(birthDate, new Date('2026-06-10T00:00:00+09:00'))).toBe(11);
  });

  it('생일 다음 날에는 올라간 나이를 유지한다', () => {
    expect(getCurrentAgeInKst(birthDate, new Date('2026-06-11T00:00:00+09:00'))).toBe(11);
  });

  it('생일이 지나지 않은 달에는 나이를 올리지 않는다', () => {
    expect(getCurrentAgeInKst(birthDate, new Date('2026-05-31T00:00:00+09:00'))).toBe(10);
  });

  it('기준 시각이 UTC 기준 전날이어도 한국시간 날짜로 판정한다', () => {
    // 2026-06-09T15:00:00Z = 2026-06-10 00:00 KST (생일 당일)
    expect(getCurrentAgeInKst(birthDate, new Date('2026-06-09T15:00:00Z'))).toBe(11);
  });
});

describe('formatDateToKstIsoString', () => {
  it('UTC 시각을 한국시간 오프셋 문자열로 변환한다', () => {
    expect(formatDateToKstIsoString(new Date('2026-03-01T15:00:00.000Z'))).toBe('2026-03-02T00:00:00.000+09:00');
  });

  it('변환한 문자열을 다시 Date로 읽으면 같은 시각이다', () => {
    const original = new Date('2026-09-27T01:23:45.678Z');
    expect(new Date(formatDateToKstIsoString(original)).getTime()).toBe(original.getTime());
  });
});

describe('일요일/학년도 주차 계산', () => {
  it('getSundayOfWeekInKst는 해당 주의 일요일 00:00(KST)을 반환한다', () => {
    // 2026-09-30(수) KST → 2026-09-27(일)
    expect(getSundayOfWeekInKst(new Date('2026-09-30T03:00:00+09:00')).toISOString()).toBe('2026-09-26T15:00:00.000Z');
    // 일요일 새벽(UTC 기준 토요일)도 같은 일요일로 본다
    expect(getSundayOfWeekInKst(new Date('2026-09-27T00:30:00+09:00')).toISOString()).toBe('2026-09-26T15:00:00.000Z');
  });

  it('getFirstSundayOfMonthKst / getLastSundayOfMonthKst', () => {
    expect(formatDateToKoreanYmd(getFirstSundayOfMonthKst(2026, 3))).toBe('2026-03-01');
    expect(formatDateToKoreanYmd(getFirstSundayOfMonthKst(2026, 4))).toBe('2026-04-05');
    expect(formatDateToKoreanYmd(getLastSundayOfMonthKst(2027, 2))).toBe('2027-02-28');
  });

  it('getSchoolYearSundays는 3월 첫 일요일부터 다음 해 2월 마지막 일요일까지 매주 반환한다', () => {
    const sundays = getSchoolYearSundays(2026);

    expect(formatDateToKoreanYmd(sundays[0])).toBe('2026-03-01');
    expect(formatDateToKoreanYmd(sundays[sundays.length - 1])).toBe('2027-02-28');
    expect(sundays).toHaveLength(53);
    expect(sundays.every((sunday) => getKoreanWeekdayIndex(sunday) === 0)).toBe(true);
  });

  it('addWeeksToSunday는 주 단위로 더하고 뺀다', () => {
    const sunday = getFirstSundayOfMonthKst(2026, 3);
    expect(formatDateToKoreanYmd(addWeeksToSunday(sunday, 1))).toBe('2026-03-08');
    expect(formatDateToKoreanYmd(addWeeksToSunday(sunday, -1))).toBe('2026-02-22');
  });
});
