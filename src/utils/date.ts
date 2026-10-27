const KOREA_TIME_ZONE = 'Asia/Seoul';

/**
 * Date 값을 한국시간 기준 yyyy-mm-dd 문자열로 변환한다.
 */
export function formatDateToKoreanYmd(dateValue: Date): string {
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateParts = dateFormatter.formatToParts(dateValue);
  const year = dateParts.find((part) => part.type === 'year')?.value ?? '';
  const month = dateParts.find((part) => part.type === 'month')?.value ?? '';
  const day = dateParts.find((part) => part.type === 'day')?.value ?? '';

  return `${year}-${month}-${day}`;
}

/**
 * Date 값을 한국시간 기준 연도/월/일 숫자로 반환한다.
 */
export function getKoreanDateParts(dateValue: Date): { year: number; month: number; day: number } {
  const ymd = formatDateToKoreanYmd(dateValue);
  return {
    year: Number(ymd.slice(0, 4)),
    month: Number(ymd.slice(5, 7)),
    day: Number(ymd.slice(8, 10)),
  };
}

/**
 * Date 값을 한국시간 기준 연도 숫자로 반환한다.
 */
export function getKoreanYear(dateValue: Date): number {
  return getKoreanDateParts(dateValue).year;
}

/**
 * 한국시간 기준 만 나이를 계산한다.
 */
export function getCurrentAgeInKst(birthDate: Date, baseDate: Date = new Date()): number {
  const today = getKoreanDateParts(baseDate);
  const birth = getKoreanDateParts(birthDate);
  let age = today.year - birth.year;
  const hasHadBirthdayThisYear = today.month > birth.month || (today.month === birth.month && today.day >= birth.day);

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age;
}

const KST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1000;

/**
 * Date 값을 한국시간 오프셋(+09:00)이 붙은 ISO 문자열로 변환한다.
 * 스프레드시트 셀에 사람이 읽기 쉬운 한국시간으로 저장하기 위해 쓰며, new Date()로 그대로 역변환된다.
 */
export function formatDateToKstIsoString(dateValue: Date): string {
  return new Date(dateValue.getTime() + KST_OFFSET_MILLISECONDS).toISOString().replace('Z', '+09:00');
}

const KOREAN_WEEKDAY_INDEX_BY_SHORT_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * 한국시간 기준 요일 인덱스(일=0 … 토=6)를 반환한다.
 */
export function getKoreanWeekdayIndex(dateValue: Date): number {
  const shortWeekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone: KOREA_TIME_ZONE,
    weekday: 'short',
  }).format(dateValue);

  return KOREAN_WEEKDAY_INDEX_BY_SHORT_NAME[shortWeekdayName] ?? 0;
}

/**
 * 한국시간 기준 해당 날짜가 속한 주의 일요일 00:00(KST)을 반환한다.
 */
export function getSundayOfWeekInKst(baseDate: Date = new Date()): Date {
  const todayKstMidnight = new Date(`${formatDateToKoreanYmd(baseDate)}T00:00:00+09:00`);
  const sunday = new Date(todayKstMidnight);
  sunday.setUTCDate(sunday.getUTCDate() - getKoreanWeekdayIndex(baseDate));
  return sunday;
}

/**
 * 주어진 일요일에서 weeks주 뒤의 일요일을 반환한다(음수면 이전).
 */
export function addWeeksToSunday(sundayKst: Date, weeks: number): Date {
  const result = new Date(sundayKst);
  result.setUTCDate(result.getUTCDate() + weeks * 7);
  return result;
}

/**
 * 특정 연/월의 첫 번째 일요일 00:00(KST)을 반환한다.
 */
export function getFirstSundayOfMonthKst(year: number, month: number): Date {
  const firstDay = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+09:00`);
  const weekdayIndex = getKoreanWeekdayIndex(firstDay);

  if (weekdayIndex === 0) {
    return firstDay;
  }

  const firstSunday = new Date(firstDay);
  firstSunday.setUTCDate(firstSunday.getUTCDate() + (7 - weekdayIndex));
  return firstSunday;
}

/**
 * 특정 연/월의 마지막 일요일 00:00(KST)을 반환한다.
 */
export function getLastSundayOfMonthKst(year: number, month: number): Date {
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0));
  const lastSunday = new Date(lastDayOfMonth);
  lastSunday.setUTCDate(lastSunday.getUTCDate() - getKoreanWeekdayIndex(lastDayOfMonth));
  return lastSunday;
}

/**
 * 시작/종료 일요일 사이의 일요일 목록(양 끝 포함)을 반환한다.
 */
export function getSundaySeriesBetween(startSunday: Date, endSunday: Date): Date[] {
  const series: Date[] = [];
  const cursor = new Date(startSunday);

  while (cursor <= endSunday) {
    series.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return series;
}

/**
 * 학년도(3월~다음 해 2월)에 속한 모든 일요일을 반환한다. 3월 첫 일요일부터 2월 마지막 일요일까지.
 */
export function getSchoolYearSundays(schoolYear: number): Date[] {
  return getSundaySeriesBetween(getFirstSundayOfMonthKst(schoolYear, 3), getLastSundayOfMonthKst(schoolYear + 1, 2));
}
