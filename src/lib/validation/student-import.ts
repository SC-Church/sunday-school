import type { ImportStudentRow } from '@/server/db/repository';
import {
  Gender,
  type Gender as GenderValue,
  Relationship,
  type Relationship as RelationshipValue,
} from '@/types/domain';

import { STUDENT_NOTE_MAX_LENGTH, normalizePhoneValue, normalizeTextValue, parseKstBirthDate } from './student';

// CSV 일괄 등록 행 검증. 한글 헤더를 쓰며 서버·화면(미리보기)이 같은 함수를 쓴다.

export const IMPORT_COLUMNS = [
  '이름',
  '성별',
  '생년월일',
  '전화번호',
  '주소',
  '보호자성함',
  '보호자관계',
  '보호자전화번호',
  '특이사항',
  '부서',
  '반',
] as const;

export const IMPORT_REQUIRED_COLUMNS = ['이름', '성별', '생년월일'] as const;

/** 자주 쓰는 다른 표기를 표준 헤더로 맞춘다. */
const HEADER_ALIASES: Record<string, (typeof IMPORT_COLUMNS)[number]> = {
  학생이름: '이름',
  성명: '이름',
  생일: '생년월일',
  연락처: '전화번호',
  학생전화번호: '전화번호',
  보호자명: '보호자성함',
  보호자이름: '보호자성함',
  관계: '보호자관계',
  보호자연락처: '보호자전화번호',
  비고: '특이사항',
  메모: '특이사항',
  부서명: '부서',
  반이름: '반',
};

const GENDER_BY_TEXT: Record<string, GenderValue> = {
  남: Gender.MALE,
  남자: Gender.MALE,
  남학생: Gender.MALE,
  M: Gender.MALE,
  MALE: Gender.MALE,
  여: Gender.FEMALE,
  여자: Gender.FEMALE,
  여학생: Gender.FEMALE,
  F: Gender.FEMALE,
  FEMALE: Gender.FEMALE,
};

const RELATIONSHIP_BY_TEXT: Record<string, RelationshipValue> = {
  부: Relationship.FATHER,
  아버지: Relationship.FATHER,
  아빠: Relationship.FATHER,
  FATHER: Relationship.FATHER,
  모: Relationship.MOTHER,
  어머니: Relationship.MOTHER,
  엄마: Relationship.MOTHER,
  MOTHER: Relationship.MOTHER,
  조부: Relationship.GRANDFATHER,
  할아버지: Relationship.GRANDFATHER,
  GRANDFATHER: Relationship.GRANDFATHER,
  조모: Relationship.GRANDMOTHER,
  할머니: Relationship.GRANDMOTHER,
  GRANDMOTHER: Relationship.GRANDMOTHER,
  기타: Relationship.ETC,
  ETC: Relationship.ETC,
};

export type ImportRowError = {
  /** 시트/엑셀 기준 행 번호(헤더가 1행이므로 데이터는 2행부터) */
  rowNumber: number;
  message: string;
};

export type ImportParseResult = {
  rows: ImportStudentRow[];
  errors: ImportRowError[];
};

/**
 * 헤더 이름을 표준 헤더로 바꾼다(공백 제거, 별칭 치환).
 */
export function normalizeImportHeader(header: string): string {
  const compact = header.replace(/\s+/g, '');
  return HEADER_ALIASES[compact] ?? compact;
}

/**
 * 여러 표기(2016-05-10, 2016.05.10, 2016/5/10, 20160510)의 생년월일을 KST 자정 Date로 만든다. 실패하면 null.
 */
export function parseImportDate(text: string): Date | null {
  const compact = text.trim();
  const matched = /^(\d{4})[.\-/]?(\d{1,2})[.\-/]?(\d{1,2})$/.exec(compact);

  if (!matched) {
    return null;
  }

  const [, year, month, day] = matched;
  return parseKstBirthDate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
}

/**
 * 표준 헤더로 정규화한 레코드 목록을 검증해 등록 가능한 행과 행별 오류로 나눈다. 오류가 하나라도 있으면 등록하지 않는다.
 */
export function parseImportRecords(records: ReadonlyArray<Record<string, string>>): ImportParseResult {
  const rows: ImportStudentRow[] = [];
  const errors: ImportRowError[] = [];

  records.forEach((rawRecord, index) => {
    const rowNumber = index + 2;
    const record: Record<string, string> = {};
    Object.entries(rawRecord).forEach(([header, value]) => {
      record[normalizeImportHeader(header)] = normalizeTextValue(value);
    });
    const rowErrors: string[] = [];
    const read = (column: (typeof IMPORT_COLUMNS)[number]): string => record[column] ?? '';

    const name = read('이름');
    if (!name) {
      rowErrors.push('이름이 비어 있습니다.');
    }

    const gender = GENDER_BY_TEXT[read('성별').toUpperCase()];
    if (!gender) {
      rowErrors.push('성별은 남/여로 입력해 주세요.');
    }

    const birthDate = parseImportDate(read('생년월일'));
    if (!birthDate) {
      rowErrors.push('생년월일은 2016-05-10 형식으로 입력해 주세요.');
    }

    const phone = normalizePhoneValue(read('전화번호'));
    if (read('전화번호') && !/^010-\d{4}-\d{4}$/.test(phone)) {
      rowErrors.push('전화번호는 010으로 시작하는 11자리여야 합니다.');
    }

    const guardianName = read('보호자성함');
    const guardianRelationshipText = read('보호자관계');
    const guardianRelationship = RELATIONSHIP_BY_TEXT[guardianRelationshipText.toUpperCase()];
    const guardianPhone = normalizePhoneValue(read('보호자전화번호'));
    const hasAnyGuardianField = Boolean(guardianName || guardianRelationshipText || read('보호자전화번호'));

    if (hasAnyGuardianField) {
      if (!guardianName || !guardianRelationshipText || !read('보호자전화번호')) {
        rowErrors.push('보호자 정보는 성함/관계/전화번호를 모두 입력해 주세요.');
      } else if (!guardianRelationship) {
        rowErrors.push('보호자관계는 부/모/조부/조모/기타 중 하나여야 합니다.');
      } else if (!/^010-\d{4}-\d{4}$/.test(guardianPhone)) {
        rowErrors.push('보호자 전화번호는 010으로 시작하는 11자리여야 합니다.');
      }
    }

    const note = read('특이사항');
    if (note.length > STUDENT_NOTE_MAX_LENGTH) {
      rowErrors.push(`특이사항은 ${STUDENT_NOTE_MAX_LENGTH}자 이하로 입력해 주세요.`);
    }

    const departmentName = read('부서');
    const className = read('반');
    if ((departmentName && !className) || (!departmentName && className)) {
      rowErrors.push('부서와 반은 함께 입력하거나 둘 다 비워 주세요.');
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, message: rowErrors.join(' ') });
      return;
    }

    rows.push({
      name,
      gender: gender!,
      birthDate: birthDate!,
      address: read('주소'),
      phone: phone || null,
      note: note || null,
      guardianContact:
        hasAnyGuardianField && guardianRelationship
          ? { name: guardianName, relationship: guardianRelationship, phone: guardianPhone }
          : null,
      departmentName: departmentName || null,
      className: className || null,
    });
  });

  return { rows, errors };
}
