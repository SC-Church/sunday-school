import {
  AttendanceStatus,
  type AttendanceStatus as AttendanceStatusValue,
  EnrollmentReason,
  type EnrollmentReason as EnrollmentReasonValue,
  EnrollmentStatus,
  type EnrollmentStatus as EnrollmentStatusValue,
  Gender,
  type Gender as GenderValue,
  Relationship,
  type Relationship as RelationshipValue,
  TalentTransactionReason,
  type TalentTransactionReason as TalentTransactionReasonValue,
} from '@/types/domain';
import { TEACHER_APPROVAL_STATUS, TEACHER_ROLE, type TeacherApprovalStatus, type TeacherRole } from '@/types/teacher';
import { formatDateToKstIsoString } from '@/utils/date';

/** 시트 셀에 쓰는 값. null은 빈 셀을 뜻한다. */
export type CellValue = string | number | boolean | null;

type ColumnCodec<T> = {
  parse: (raw: string) => T;
  serialize: (value: T) => CellValue;
};

type TableColumns<R> = { [K in keyof R]: ColumnCodec<R[K]> };

export type SheetTable<R> = {
  /** 스프레드시트 탭 이름 */
  title: string;
  /** 헤더(1행) 순서와 일치해야 하는 컬럼 이름 목록 */
  columnNames: ReadonlyArray<keyof R & string>;
  columns: TableColumns<R>;
};

/** 시트 데이터가 스키마와 맞지 않을 때 발생하는 오류. 사람이 시트를 직접 수정했을 때 위치를 알려준다. */
export class SheetDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetDataError';
  }
}

/**
 * 컬럼 코덱 목록으로 테이블 정의를 만든다. 객체 키 순서가 곧 시트 컬럼 순서다.
 */
function defineTable<R>(title: string, columns: TableColumns<R>): SheetTable<R> {
  return {
    title,
    columnNames: Object.keys(columns) as Array<keyof R & string>,
    columns,
  };
}

const requiredString: ColumnCodec<string> = {
  parse: (raw) => {
    if (!raw) {
      throw new SheetDataError('필수 값이 비어 있습니다.');
    }
    return raw;
  },
  serialize: (value) => value,
};

/** 빈 셀을 빈 문자열로 읽는 문자열(주소처럼 비어 있어도 되는 필수 타입 컬럼). */
const optionalString: ColumnCodec<string> = {
  parse: (raw) => raw,
  serialize: (value) => (value ? value : null),
};

const nullableString: ColumnCodec<string | null> = {
  parse: (raw) => (raw ? raw : null),
  serialize: (value) => value,
};

/**
 * 셀 문자열을 Date로 변환한다. 해석할 수 없으면 오류를 던진다.
 */
function parseDateCell(raw: string): Date {
  const parsedDate = new Date(raw);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new SheetDataError(`날짜 형식이 올바르지 않습니다: ${raw}`);
  }

  return parsedDate;
}

const requiredDate: ColumnCodec<Date> = {
  parse: (raw) => {
    if (!raw) {
      throw new SheetDataError('필수 날짜가 비어 있습니다.');
    }
    return parseDateCell(raw);
  },
  serialize: (value) => formatDateToKstIsoString(value),
};

const nullableDate: ColumnCodec<Date | null> = {
  parse: (raw) => (raw ? parseDateCell(raw) : null),
  serialize: (value) => (value ? formatDateToKstIsoString(value) : null),
};

const integer: ColumnCodec<number> = {
  parse: (raw) => {
    const parsedNumber = Number(raw.replace(/,/g, ''));

    if (!raw || !Number.isInteger(parsedNumber)) {
      throw new SheetDataError(`정수 형식이 올바르지 않습니다: ${raw}`);
    }

    return parsedNumber;
  },
  serialize: (value) => value,
};

const boolean: ColumnCodec<boolean> = {
  parse: (raw) => {
    const normalizedValue = raw.trim().toUpperCase();

    if (normalizedValue === 'TRUE') {
      return true;
    }
    if (normalizedValue === 'FALSE') {
      return false;
    }
    throw new SheetDataError(`TRUE/FALSE 형식이 올바르지 않습니다: ${raw}`);
  },
  serialize: (value) => value,
};

/** 빈 셀을 false로 읽는 불리언. 나중에 추가된 컬럼(기존 행은 비어 있음)에 쓴다. */
const optionalBoolean: ColumnCodec<boolean> = {
  parse: (raw) => (raw ? boolean.parse(raw) : false),
  serialize: (value) => value,
};

/** 쉼표로 구분한 문자열 목록(예: 반에 배정된 교사 id 목록). */
const stringList: ColumnCodec<string[]> = {
  parse: (raw) =>
    raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  serialize: (value) => (value.length > 0 ? value.join(',') : null),
};

/**
 * 허용 값 목록으로 제한된 enum 컬럼 코덱을 만든다.
 */
function enumOf<T extends string>(values: Record<string, T>): ColumnCodec<T> {
  const allowedValues = new Set<string>(Object.values(values));

  return {
    parse: (raw) => {
      if (!allowedValues.has(raw)) {
        throw new SheetDataError(`허용되지 않은 값입니다: ${raw}`);
      }
      return raw as T;
    },
    serialize: (value) => value,
  };
}

/**
 * 빈 값을 허용하는 enum 컬럼 코덱을 만든다.
 */
function nullableEnumOf<T extends string>(values: Record<string, T>): ColumnCodec<T | null> {
  const requiredCodec = enumOf(values);

  return {
    parse: (raw) => (raw ? requiredCodec.parse(raw) : null),
    serialize: (value) => value,
  };
}

export type TeacherRecord = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  birthDate: Date | null;
  grade: string | null;
  role: TeacherRole;
  approvalStatus: TeacherApprovalStatus;
  approvalProcessedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** scrypt 비밀번호 해시(src/lib/password.ts). 비어 있으면 아직 비밀번호가 없는 계정(관리자 초기화 필요) */
  passwordHash: string | null;
};

export type StudentRecord = {
  id: string;
  name: string;
  gender: GenderValue;
  birthDate: Date;
  address: string;
  phone: string | null;
  currentTalent: number;
  createdAt: Date;
  updatedAt: Date;
  /** 특이사항(알레르기, 가정 상황 등). 화면에서는 교사에게만 보인다. */
  note: string | null;
  /** 새친구 여부. 정착 처리하면 false가 된다. */
  isNewFriend: boolean;
  /** 첫 방문일(새친구 출석 횟수 계산 기준). */
  firstVisitDate: Date | null;
};

export type GuardianContactRecord = {
  id: string;
  studentId: string;
  name: string;
  relationship: RelationshipValue;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AttendanceRecord = {
  id: string;
  studentId: string;
  attendanceDate: Date;
  status: AttendanceStatusValue;
  createdAt: Date;
  updatedAt: Date;
  /** 출석 당시 소속 반. 컬럼 추가 전 행은 null이며 통계에서 배정 이력으로 되짚는다. */
  classId: string | null;
};

export type SettingRecord = {
  key: string;
  value: string;
  updatedAt: Date;
};

export type DepartmentRecord = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ClassRecord = {
  id: string;
  departmentId: string;
  /** 반이 속한 학년도(3월 시작). 반은 학년도마다 따로 존재한다. */
  schoolYear: number;
  name: string;
  sortOrder: number;
  /** 담당 교사 id 목록 */
  teacherIds: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type EnrollmentRecord = {
  id: string;
  studentId: string;
  classId: string;
  schoolYear: number;
  status: EnrollmentStatusValue;
  reason: EnrollmentReasonValue;
  startedAt: Date;
  endedAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TalentTransactionRecord = {
  id: string;
  studentId: string;
  teacherId: string | null;
  reason: TalentTransactionReasonValue | null;
  transactedAt: Date;
  amount: number;
  createdAt: Date;
};

export const SHEET_TABLES = {
  teachers: defineTable<TeacherRecord>('teachers', {
    id: requiredString,
    email: requiredString,
    name: nullableString,
    phone: nullableString,
    birthDate: nullableDate,
    grade: nullableString,
    role: enumOf(TEACHER_ROLE),
    approvalStatus: enumOf(TEACHER_APPROVAL_STATUS),
    approvalProcessedAt: nullableDate,
    isActive: boolean,
    createdAt: requiredDate,
    updatedAt: requiredDate,
    passwordHash: nullableString,
  }),
  students: defineTable<StudentRecord>('students', {
    id: requiredString,
    name: requiredString,
    gender: enumOf(Gender),
    birthDate: requiredDate,
    address: optionalString,
    phone: nullableString,
    currentTalent: integer,
    createdAt: requiredDate,
    updatedAt: requiredDate,
    note: nullableString,
    isNewFriend: optionalBoolean,
    firstVisitDate: nullableDate,
  }),
  guardianContacts: defineTable<GuardianContactRecord>('guardian_contacts', {
    id: requiredString,
    studentId: requiredString,
    name: requiredString,
    relationship: enumOf(Relationship),
    phone: requiredString,
    createdAt: requiredDate,
    updatedAt: requiredDate,
  }),
  attendances: defineTable<AttendanceRecord>('attendances', {
    id: requiredString,
    studentId: requiredString,
    attendanceDate: requiredDate,
    status: enumOf(AttendanceStatus),
    createdAt: requiredDate,
    updatedAt: requiredDate,
    classId: nullableString,
  }),
  talentTransactions: defineTable<TalentTransactionRecord>('talent_transactions', {
    id: requiredString,
    studentId: requiredString,
    teacherId: nullableString,
    reason: nullableEnumOf(TalentTransactionReason),
    transactedAt: requiredDate,
    amount: integer,
    createdAt: requiredDate,
  }),
  settings: defineTable<SettingRecord>('settings', {
    key: requiredString,
    value: requiredString,
    updatedAt: requiredDate,
  }),
  departments: defineTable<DepartmentRecord>('departments', {
    id: requiredString,
    name: requiredString,
    sortOrder: integer,
    isActive: boolean,
    createdAt: requiredDate,
    updatedAt: requiredDate,
  }),
  classes: defineTable<ClassRecord>('classes', {
    id: requiredString,
    departmentId: requiredString,
    schoolYear: integer,
    name: requiredString,
    sortOrder: integer,
    teacherIds: stringList,
    isActive: boolean,
    createdAt: requiredDate,
    updatedAt: requiredDate,
  }),
  enrollments: defineTable<EnrollmentRecord>('enrollments', {
    id: requiredString,
    studentId: requiredString,
    classId: requiredString,
    schoolYear: integer,
    status: enumOf(EnrollmentStatus),
    reason: enumOf(EnrollmentReason),
    startedAt: requiredDate,
    endedAt: nullableDate,
    note: nullableString,
    createdAt: requiredDate,
    updatedAt: requiredDate,
  }),
};

/** 교회 이름 설정 키 */
export const SETTING_KEY_CHURCH_NAME = 'church_name';

export type SheetTableKey = keyof typeof SHEET_TABLES;

export type SheetRecordByKey = {
  [K in SheetTableKey]: (typeof SHEET_TABLES)[K] extends SheetTable<infer R> ? R : never;
};

/** 시트에서 읽은 레코드와 그 레코드가 있는 행 위치(0부터, 헤더가 0행). */
export type SheetRow<R> = {
  rowIndex: number;
  record: R;
};

/**
 * 헤더 행이 스키마 컬럼 순서로 시작하는지 검증한다. 스키마 뒤에 붙은 추가 컬럼은 허용한다(앱이 건드리지 않음).
 */
export function assertHeaderMatches<R>(table: SheetTable<R>, headerRow: ReadonlyArray<string> | undefined): void {
  const actualHeader = (headerRow ?? []).map((cell) => cell.trim());
  const isMatched = table.columnNames.every((columnName, index) => actualHeader[index] === columnName);

  if (!isMatched) {
    throw new SheetDataError(
      `'${table.title}' 탭의 1행 헤더가 예상과 다릅니다. 기대값: ${table.columnNames.join(', ')} / 실제값: ${actualHeader.join(', ') || '(비어 있음)'}`
    );
  }
}

/**
 * values.batchGet 결과(2차원 문자열 배열)를 레코드 목록으로 변환한다. 완전히 빈 행은 건너뛴다.
 */
export function parseTableValues<R>(table: SheetTable<R>, values: ReadonlyArray<ReadonlyArray<string>>): SheetRow<R>[] {
  assertHeaderMatches(table, values[0]);

  const rows: SheetRow<R>[] = [];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const rowValues = values[rowIndex] ?? [];
    const isEmptyRow = table.columnNames.every((_, columnIndex) => !(rowValues[columnIndex] ?? '').trim());

    if (isEmptyRow) {
      continue;
    }

    const record = {} as R;

    table.columnNames.forEach((columnName, columnIndex) => {
      const rawValue = (rowValues[columnIndex] ?? '').trim();

      try {
        record[columnName] = table.columns[columnName].parse(rawValue);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        // 시트 UI 기준 행 번호는 1부터 시작하므로 +1 한다.
        throw new SheetDataError(`'${table.title}' 탭 ${rowIndex + 1}행 ${columnName} 컬럼: ${reason}`);
      }
    });

    rows.push({ rowIndex, record });
  }

  return rows;
}

/**
 * 레코드를 스키마 컬럼 순서의 셀 값 배열로 변환한다.
 */
export function serializeRecord<R>(table: SheetTable<R>, record: R): CellValue[] {
  return table.columnNames.map((columnName) => table.columns[columnName].serialize(record[columnName]));
}
