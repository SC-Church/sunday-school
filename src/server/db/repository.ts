import {
  AttendanceStatus,
  type AttendanceStatus as AttendanceStatusValue,
  EnrollmentReason,
  type EnrollmentReason as EnrollmentReasonValue,
  EnrollmentStatus,
  type Gender,
  type Relationship,
  TalentTransactionReason,
} from '@/types/domain';
import { TEACHER_APPROVAL_STATUS, TEACHER_ROLE, type TeacherApprovalStatus, type TeacherRole } from '@/types/teacher';

import {
  type Dataset,
  type DatasetTables,
  getDataset,
  invalidateDataset,
  readDatasetFresh,
  recordsOf,
} from './dataset';
import { type RowAppend, type RowDelete, type RowUpdate, buildBatchRequests } from './sheet-requests';
import {
  type AttendanceRecord,
  type ClassRecord,
  type DepartmentRecord,
  type EnrollmentRecord,
  type GuardianContactRecord,
  SETTING_KEY_CHURCH_NAME,
  SHEET_TABLES,
  type SheetRecordByKey,
  type SheetTableKey,
  type StudentRecord,
  type TalentTransactionRecord,
  type TeacherRecord,
  serializeRecord,
} from './sheet-schema';
import { WriteConflictError, getSheetIdByTitle, runExclusiveWrite, writeSheets } from './sheets-client';
import { scheduleDatasetWarmup } from './warmup';

import { randomUUID } from 'node:crypto';

/** 동시 저장 충돌 시 쓰기 작업 전체(읽기→계산→쓰기)를 다시 시도하는 최대 횟수 */
const MAX_WRITE_CONFLICT_RETRY_COUNT = 3;

/** 쓰기 대상 레코드를 찾지 못했을 때 발생하는 오류 */
export class RecordNotFoundError extends Error {
  constructor(tableKey: SheetTableKey, id: string) {
    super(`${SHEET_TABLES[tableKey].title}에서 id=${id} 레코드를 찾지 못했습니다.`);
    this.name = 'RecordNotFoundError';
  }
}

/** 입력이 규칙에 맞지 않아 쓰기를 거부할 때 발생하는 오류(API는 400으로 변환한다) */
export class InvalidWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWriteError';
  }
}

type WriteChanges = { updates?: RowUpdate[]; appends?: RowAppend[]; deletes?: RowDelete[] };

/** 쓰기 작업 안에서 쓰는 읽기/반영 함수. commit은 처음 읽은 시점 이후 다른 쓰기가 없었을 때만 반영된다. */
type WriteTransaction = {
  /** 시트 전체를 새로 읽는다(캐시를 쓰지 않는다). */
  read: () => Promise<DatasetTables>;
  commit: (changes: WriteChanges) => Promise<void>;
};

/**
 * 쓰기 작업을 실행한다. 읽은 뒤 다른 교사의 저장이 먼저 반영되어 충돌하면(WriteConflictError)
 * 최신 데이터를 다시 읽어 작업 전체를 재시도한다. 충돌 응답은 반영되지 않았음이 확실하므로 재시도해도 중복 반영되지 않는다.
 * 반영이 끝나면 조회 캐시를 비우고 응답 후 백그라운드에서 다시 읽어 둔다.
 */
function runWrite<T>(operation: (tx: WriteTransaction) => Promise<T>): Promise<T> {
  return runExclusiveWrite(async () => {
    for (let attempt = 0; ; attempt += 1) {
      let firstReadRevision: number | null = null;
      let hasCommitted = false;
      const tx: WriteTransaction = {
        read: async () => {
          const dataset = await readDatasetFresh();
          firstReadRevision ??= dataset.revision;
          return dataset.tables;
        },
        // 읽지 않고 추가만 하는 작업은 기존 행에 의존하지 않으므로 revision 확인 없이 반영한다.
        commit: async (changes) => {
          const requests = buildBatchRequests(changes);

          if (requests.length === 0) {
            return;
          }

          await writeSheets(requests, firstReadRevision);
          hasCommitted = true;
        },
      };

      try {
        return await operation(tx);
      } catch (error) {
        if (error instanceof WriteConflictError && attempt < MAX_WRITE_CONFLICT_RETRY_COUNT) {
          continue;
        }
        throw error;
      } finally {
        if (hasCommitted) {
          invalidateDataset();
          scheduleDatasetWarmup();
        }
      }
    }
  });
}

/**
 * 테이블 키에 해당하는 탭의 sheetId를 반환한다.
 */
async function getSheetId(key: SheetTableKey): Promise<number> {
  const sheetIdByTitle = await getSheetIdByTitle();
  const sheetId = sheetIdByTitle.get(SHEET_TABLES[key].title);

  if (sheetId === undefined) {
    throw new Error(`'${SHEET_TABLES[key].title}' 탭이 없습니다. yarn sheets:init을 먼저 실행해 주세요.`);
  }

  return sheetId;
}

/**
 * 레코드 한 줄을 추가하는 쓰기 작업을 만든다.
 */
async function toAppend<K extends SheetTableKey>(key: K, record: SheetRecordByKey[K]): Promise<RowAppend> {
  return {
    sheetId: await getSheetId(key),
    cells: serializeRecord(SHEET_TABLES[key] as never, record),
  };
}

/**
 * 바뀐 필드만 해당 셀에 쓰는 작업 목록을 만든다. 다른 컬럼은 건드리지 않아 동시 수정 피해를 줄인다.
 */
async function toColumnUpdates<K extends SheetTableKey>(
  key: K,
  rowIndex: number,
  changes: Partial<SheetRecordByKey[K]>
): Promise<RowUpdate[]> {
  const sheetId = await getSheetId(key);
  const table = SHEET_TABLES[key] as unknown as {
    columnNames: ReadonlyArray<string>;
    columns: Record<string, { serialize: (value: unknown) => RowUpdate['cells'][number] }>;
  };

  return Object.entries(changes).map(([columnName, value]) => {
    const columnIndex = table.columnNames.indexOf(columnName);

    if (columnIndex < 0) {
      throw new Error(`알 수 없는 컬럼입니다: ${columnName}`);
    }

    return {
      sheetId,
      rowIndex,
      columnIndex,
      cells: [table.columns[columnName].serialize(value)],
    };
  });
}

/**
 * 행 삭제 작업 목록을 만든다.
 */
async function toDeletes(key: SheetTableKey, rows: ReadonlyArray<{ rowIndex: number }>): Promise<RowDelete[]> {
  const sheetId = await getSheetId(key);
  return rows.map((row) => ({ sheetId, rowIndex: row.rowIndex }));
}

/**
 * 한국어 이름 오름차순 비교 함수.
 */
function compareByKoreanName(a: string, b: string): number {
  return a.localeCompare(b, 'ko-KR');
}

/**
 * 같은 학생·같은 날짜의 출석 행이 여러 개일 때(동시 저장 충돌 등) 가장 최근에 수정된 행만 남긴다.
 */
export function pickLatestAttendanceRows<T extends { record: AttendanceRecord }>(rows: ReadonlyArray<T>): T[] {
  const latestByKey = new Map<string, T>();

  rows.forEach((row) => {
    const key = `${row.record.studentId}:${row.record.attendanceDate.getTime()}`;
    const current = latestByKey.get(key);

    if (!current || row.record.updatedAt.getTime() >= current.record.updatedAt.getTime()) {
      latestByKey.set(key, row);
    }
  });

  return [...latestByKey.values()];
}

/**
 * 학생의 특정 학년도 현재(ACTIVE) 배정을 찾는다.
 */
export function findActiveEnrollment<T extends { record: EnrollmentRecord }>(
  rows: ReadonlyArray<T>,
  studentId: string,
  schoolYear: number
): T | undefined {
  return rows.find(
    (row) =>
      row.record.studentId === studentId &&
      row.record.schoolYear === schoolYear &&
      row.record.status === EnrollmentStatus.ACTIVE
  );
}

// ---------------------------------------------------------------------------
// 전체 조회(캐시)
// ---------------------------------------------------------------------------

/** 조회 화면이 쓰는 전체 데이터. 레코드 배열이며 출석은 중복 행이 정리되어 있다. */
export type StoreSnapshot = {
  revision: number;
  teachers: TeacherRecord[];
  students: StudentRecord[];
  guardianContacts: GuardianContactRecord[];
  attendances: AttendanceRecord[];
  talentTransactions: TalentTransactionRecord[];
  departments: DepartmentRecord[];
  classes: ClassRecord[];
  enrollments: EnrollmentRecord[];
  churchName: string | null;
};

/**
 * 데이터셋을 화면용 스냅샷으로 변환한다.
 */
function toSnapshot(dataset: Dataset): StoreSnapshot {
  const settings = recordsOf(dataset, 'settings');

  return {
    revision: dataset.revision,
    teachers: recordsOf(dataset, 'teachers'),
    students: recordsOf(dataset, 'students').sort((a, b) => compareByKoreanName(a.name, b.name)),
    guardianContacts: recordsOf(dataset, 'guardianContacts'),
    attendances: pickLatestAttendanceRows(dataset.tables.attendances).map((row) => row.record),
    talentTransactions: recordsOf(dataset, 'talentTransactions'),
    departments: recordsOf(dataset, 'departments').sort((a, b) => a.sortOrder - b.sortOrder),
    classes: recordsOf(dataset, 'classes').sort((a, b) => a.sortOrder - b.sortOrder),
    enrollments: recordsOf(dataset, 'enrollments'),
    churchName: settings.find((setting) => setting.key === SETTING_KEY_CHURCH_NAME)?.value ?? null,
  };
}

/**
 * 전체 데이터 스냅샷을 반환한다(캐시 사용). 화면·서비스 계층은 이 함수로 읽는다.
 */
export async function getStoreSnapshot(): Promise<StoreSnapshot> {
  return toSnapshot(await getDataset());
}

// ---------------------------------------------------------------------------
// 교사
// ---------------------------------------------------------------------------

/**
 * 전체 교사 목록을 반환한다.
 */
export async function listTeachers(): Promise<TeacherRecord[]> {
  return (await getStoreSnapshot()).teachers;
}

/**
 * id로 교사를 조회한다.
 */
export async function findTeacherById(teacherId: string): Promise<TeacherRecord | null> {
  return (await listTeachers()).find((teacher) => teacher.id === teacherId) ?? null;
}

/**
 * 이메일(소문자 기준)로 교사를 조회한다.
 */
export async function findTeacherByEmail(email: string): Promise<TeacherRecord | null> {
  const normalizedEmail = email.toLowerCase();
  return (await listTeachers()).find((teacher) => teacher.email.toLowerCase() === normalizedEmail) ?? null;
}

/**
 * 이메일로 교사를 조회하되 캐시를 쓰지 않고 시트를 새로 읽는다.
 * 로그인 검증에 쓴다 — 다른 서버에서 방금 승인했거나 비밀번호를 초기화한 직후에도 바로 반영되어야 하기 때문이다.
 */
export async function findTeacherByEmailFresh(email: string): Promise<TeacherRecord | null> {
  const normalizedEmail = email.toLowerCase();
  const dataset = await readDatasetFresh();
  return recordsOf(dataset, 'teachers').find((teacher) => teacher.email.toLowerCase() === normalizedEmail) ?? null;
}

/**
 * 회원가입으로 교사 계정을 만든다. 새 계정은 항상 일반 교사·승인 대기 상태로 시작한다.
 * 같은 이메일이 이미 있으면(비밀번호가 없는 이전 계정 포함) 만들지 않고 email_taken을 반환한다
 * — 이메일 소유 확인을 하지 않으므로 기존 계정에 비밀번호를 새로 거는 방식의 가로채기를 막기 위함이다.
 */
export async function createTeacherAccount({
  email,
  name,
  passwordHash,
}: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<{ result: 'created'; teacherId: string } | { result: 'email_taken' }> {
  return runWrite(async (tx) => {
    const { teachers } = await tx.read();
    const normalizedEmail = email.toLowerCase();

    if (teachers.some((row) => row.record.email.toLowerCase() === normalizedEmail)) {
      return { result: 'email_taken' as const };
    }

    const now = new Date();
    const teacherId = randomUUID();

    await tx.commit({
      appends: [
        await toAppend('teachers', {
          id: teacherId,
          email: normalizedEmail,
          name,
          phone: null,
          birthDate: null,
          grade: null,
          role: TEACHER_ROLE.TEACHER,
          approvalStatus: TEACHER_APPROVAL_STATUS.PENDING,
          approvalProcessedAt: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          passwordHash,
        }),
      ],
    });

    return { result: 'created' as const, teacherId };
  });
}

/**
 * 교사 필드를 수정하고 수정된 레코드를 반환한다. 대상이 없으면 RecordNotFoundError를 던진다.
 */
async function updateTeacher(
  teacherId: string,
  changes: Partial<Omit<TeacherRecord, 'id' | 'email' | 'createdAt' | 'updatedAt'>>
): Promise<TeacherRecord> {
  return runWrite(async (tx) => {
    const { teachers } = await tx.read();
    const targetRow = teachers.find((row) => row.record.id === teacherId);

    if (!targetRow) {
      throw new RecordNotFoundError('teachers', teacherId);
    }

    const changesWithTimestamp = { ...changes, updatedAt: new Date() };
    await tx.commit({ updates: await toColumnUpdates('teachers', targetRow.rowIndex, changesWithTimestamp) });

    return { ...targetRow.record, ...changesWithTimestamp };
  });
}

/**
 * 이메일로 찾은 교사를 승인된 관리자로 지정한다(첫 관리자 지정용, 시트 접근 권한이 있는 사람만 실행하는 스크립트에서 사용).
 */
export async function promoteTeacherToAdminByEmail(email: string): Promise<TeacherRecord> {
  const teacher = await findTeacherByEmail(email);

  if (!teacher) {
    throw new RecordNotFoundError('teachers', email);
  }

  return updateTeacher(teacher.id, {
    role: TEACHER_ROLE.ADMIN,
    approvalStatus: TEACHER_APPROVAL_STATUS.APPROVED,
    approvalProcessedAt: new Date(),
  });
}

/**
 * 교사의 비밀번호 해시를 바꾼다(본인 변경, 관리자 초기화 공용).
 */
export function setTeacherPasswordHash(teacherId: string, passwordHash: string): Promise<TeacherRecord> {
  return updateTeacher(teacherId, { passwordHash });
}

/**
 * 가입 승인/거절 상태를 반영한다.
 */
export function updateTeacherApproval(
  teacherId: string,
  approvalStatus: TeacherApprovalStatus
): Promise<TeacherRecord> {
  return updateTeacher(teacherId, { approvalStatus, approvalProcessedAt: new Date() });
}

/**
 * 교사 권한을 변경한다.
 */
export function updateTeacherRole(teacherId: string, role: TeacherRole): Promise<TeacherRecord> {
  return updateTeacher(teacherId, { role });
}

/**
 * 교사 프로필(이름/연락처/생일/활성 여부)을 수정한다.
 */
export function updateTeacherProfile(
  teacherId: string,
  changes: Partial<Pick<TeacherRecord, 'name' | 'phone' | 'birthDate' | 'grade' | 'isActive'>>
): Promise<TeacherRecord> {
  return updateTeacher(teacherId, changes);
}

/**
 * 교사를 삭제하고 반 배정에서도 뺀다. 달란트 기록의 teacherId는 그대로 두며, 조회 시 없는 교사는 null로 취급한다.
 */
export async function deleteTeacher(teacherId: string): Promise<void> {
  await runWrite(async (tx) => {
    const { teachers, classes } = await tx.read();
    const targetRows = teachers.filter((row) => row.record.id === teacherId);

    if (targetRows.length === 0) {
      throw new RecordNotFoundError('teachers', teacherId);
    }

    const now = new Date();
    const updates: RowUpdate[] = [];

    for (const classRow of classes) {
      if (classRow.record.teacherIds.includes(teacherId)) {
        updates.push(
          ...(await toColumnUpdates('classes', classRow.rowIndex, {
            teacherIds: classRow.record.teacherIds.filter((id) => id !== teacherId),
            updatedAt: now,
          }))
        );
      }
    }

    await tx.commit({ updates, deletes: await toDeletes('teachers', targetRows) });
  });
}

// ---------------------------------------------------------------------------
// 학생 / 보호자 / 반 배정
// ---------------------------------------------------------------------------

export type StudentWithGuardian = StudentRecord & {
  guardianContact: Pick<GuardianContactRecord, 'name' | 'relationship' | 'phone'> | null;
};

export type StudentWriteInput = {
  name: string;
  gender: Gender;
  birthDate: Date;
  address: string;
  phone: string | null;
  note: string | null;
  isNewFriend: boolean;
  firstVisitDate: Date | null;
  guardianContact: {
    name: string;
    relationship: Relationship;
    phone: string;
  } | null;
  /** 배정할 반. null이면 미배정 */
  classId: string | null;
  /** 배정 학년도 */
  schoolYear: number;
};

/**
 * 학생 목록을 이름 오름차순으로 반환한다.
 */
export async function listStudents(): Promise<StudentRecord[]> {
  return (await getStoreSnapshot()).students;
}

/**
 * 스냅샷에서 보호자 정보를 붙인 학생 목록을 만든다.
 */
export function withGuardians(snapshot: StoreSnapshot): StudentWithGuardian[] {
  const guardianByStudentId = new Map(snapshot.guardianContacts.map((guardian) => [guardian.studentId, guardian]));

  return snapshot.students.map((student) => {
    const guardian = guardianByStudentId.get(student.id);
    return {
      ...student,
      guardianContact: guardian
        ? { name: guardian.name, relationship: guardian.relationship, phone: guardian.phone }
        : null,
    };
  });
}

/**
 * 보호자 정보를 포함한 학생 목록을 이름 오름차순으로 반환한다.
 */
export async function listStudentsWithGuardian(): Promise<StudentWithGuardian[]> {
  return withGuardians(await getStoreSnapshot());
}

/**
 * id로 학생(보호자 포함)을 조회한다.
 */
export async function findStudentWithGuardian(studentId: string): Promise<StudentWithGuardian | null> {
  return (await listStudentsWithGuardian()).find((student) => student.id === studentId) ?? null;
}

/**
 * 반 id가 존재하고 해당 학년도의 반인지 확인한다.
 */
function assertClassInYear(
  classes: DatasetTables['classes'],
  classId: string,
  schoolYear: number
): DatasetTables['classes'][number] {
  const classRow = classes.find((row) => row.record.id === classId);

  if (!classRow) {
    throw new InvalidWriteError('선택한 반을 찾을 수 없습니다.');
  }
  if (classRow.record.schoolYear !== schoolYear) {
    throw new InvalidWriteError('선택한 반은 해당 학년도의 반이 아닙니다.');
  }

  return classRow;
}

/**
 * 새 배정 레코드를 만든다.
 */
function buildEnrollment(
  studentId: string,
  classId: string,
  schoolYear: number,
  reason: EnrollmentReasonValue,
  now: Date,
  note: string | null = null
): EnrollmentRecord {
  return {
    id: randomUUID(),
    studentId,
    classId,
    schoolYear,
    status: EnrollmentStatus.ACTIVE,
    reason,
    startedAt: now,
    endedAt: null,
    note,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 학생의 해당 학년도 배정을 바꾸는 쓰기 작업(종료 + 신규)을 만든다. 같은 반이면 아무 작업도 만들지 않는다.
 */
async function buildClassChange(
  tables: DatasetTables,
  studentId: string,
  schoolYear: number,
  nextClassId: string | null,
  reason: EnrollmentReasonValue,
  now: Date
): Promise<WriteChanges> {
  const activeRow = findActiveEnrollment(tables.enrollments, studentId, schoolYear);

  if ((activeRow?.record.classId ?? null) === nextClassId) {
    return {};
  }

  if (nextClassId) {
    assertClassInYear(tables.classes, nextClassId, schoolYear);
  }

  const updates = activeRow
    ? await toColumnUpdates('enrollments', activeRow.rowIndex, {
        status: EnrollmentStatus.ENDED,
        endedAt: now,
        updatedAt: now,
      })
    : [];
  const appends = nextClassId
    ? [await toAppend('enrollments', buildEnrollment(studentId, nextClassId, schoolYear, reason, now))]
    : [];

  return { updates, appends };
}

/**
 * 학생과 (있다면) 보호자 정보, 반 배정을 함께 생성한다.
 */
export async function createStudent(input: StudentWriteInput): Promise<StudentRecord> {
  return runWrite(async (tx) => {
    const tables = await tx.read();
    const now = new Date();
    const student: StudentRecord = {
      id: randomUUID(),
      name: input.name,
      gender: input.gender,
      birthDate: input.birthDate,
      address: input.address,
      phone: input.phone,
      currentTalent: 0,
      createdAt: now,
      updatedAt: now,
      note: input.note,
      isNewFriend: input.isNewFriend,
      firstVisitDate: input.firstVisitDate,
    };
    const appends = [await toAppend('students', student)];

    if (input.guardianContact) {
      appends.push(
        await toAppend('guardianContacts', {
          id: randomUUID(),
          studentId: student.id,
          ...input.guardianContact,
          createdAt: now,
          updatedAt: now,
        })
      );
    }

    if (input.classId) {
      assertClassInYear(tables.classes, input.classId, input.schoolYear);
      appends.push(
        await toAppend(
          'enrollments',
          buildEnrollment(student.id, input.classId, input.schoolYear, EnrollmentReason.MANUAL, now)
        )
      );
    }

    await tx.commit({ appends });
    return student;
  });
}

/**
 * 학생 정보를 수정하고, 보호자 정보는 있으면 추가/수정, 없으면 삭제하며, 반이 바뀌었으면 배정을 옮긴다.
 */
export async function updateStudent(studentId: string, input: StudentWriteInput): Promise<void> {
  await runWrite(async (tx) => {
    const tables = await tx.read();
    const { students, guardianContacts } = tables;
    const studentRow = students.find((row) => row.record.id === studentId);

    if (!studentRow) {
      throw new RecordNotFoundError('students', studentId);
    }

    const now = new Date();
    const updates = await toColumnUpdates('students', studentRow.rowIndex, {
      name: input.name,
      gender: input.gender,
      birthDate: input.birthDate,
      address: input.address,
      phone: input.phone,
      note: input.note,
      isNewFriend: input.isNewFriend,
      firstVisitDate: input.firstVisitDate,
      updatedAt: now,
    });
    const appends: RowAppend[] = [];
    const guardianRows = guardianContacts.filter((row) => row.record.studentId === studentId);
    const [primaryGuardianRow, ...duplicateGuardianRows] = guardianRows;
    // 학생당 보호자는 1명(1:1)이므로 혹시 생긴 중복 행은 함께 정리한다.
    const deletes = await toDeletes('guardianContacts', input.guardianContact ? duplicateGuardianRows : guardianRows);

    if (input.guardianContact) {
      if (primaryGuardianRow) {
        updates.push(
          ...(await toColumnUpdates('guardianContacts', primaryGuardianRow.rowIndex, {
            ...input.guardianContact,
            updatedAt: now,
          }))
        );
      } else {
        appends.push(
          await toAppend('guardianContacts', {
            id: randomUUID(),
            studentId,
            ...input.guardianContact,
            createdAt: now,
            updatedAt: now,
          })
        );
      }
    }

    const classChange = await buildClassChange(
      tables,
      studentId,
      input.schoolYear,
      input.classId,
      EnrollmentReason.TRANSFER,
      now
    );

    await tx.commit({
      updates: [...updates, ...(classChange.updates ?? [])],
      appends: [...appends, ...(classChange.appends ?? [])],
      deletes,
    });
  });
}

/**
 * 학생을 삭제한다. 보호자·출석·달란트 기록·반 배정도 함께 지운다.
 */
export async function deleteStudent(studentId: string): Promise<void> {
  await runWrite(async (tx) => {
    const { students, guardianContacts, attendances, talentTransactions, enrollments } = await tx.read();
    const studentRows = students.filter((row) => row.record.id === studentId);

    if (studentRows.length === 0) {
      throw new RecordNotFoundError('students', studentId);
    }

    const isTargetStudent = (row: { record: { studentId: string } }) => row.record.studentId === studentId;

    await tx.commit({
      deletes: [
        ...(await toDeletes('students', studentRows)),
        ...(await toDeletes('guardianContacts', guardianContacts.filter(isTargetStudent))),
        ...(await toDeletes('attendances', attendances.filter(isTargetStudent))),
        ...(await toDeletes('talentTransactions', talentTransactions.filter(isTargetStudent))),
        ...(await toDeletes('enrollments', enrollments.filter(isTargetStudent))),
      ],
    });
  });
}

/**
 * 새친구를 정착(일반 학생)으로 처리한다.
 */
export async function settleNewFriend(studentId: string): Promise<void> {
  await runWrite(async (tx) => {
    const { students } = await tx.read();
    const studentRow = students.find((row) => row.record.id === studentId);

    if (!studentRow) {
      throw new RecordNotFoundError('students', studentId);
    }

    await tx.commit({
      updates: await toColumnUpdates('students', studentRow.rowIndex, { isNewFriend: false, updatedAt: new Date() }),
    });
  });
}

/**
 * 학생을 다른 반(또는 미배정)으로 옮긴다. 조직 관리·부서 이동에서 사용한다.
 */
export async function moveStudentToClass({
  studentId,
  schoolYear,
  classId,
  reason,
}: {
  studentId: string;
  schoolYear: number;
  classId: string | null;
  reason: EnrollmentReasonValue;
}): Promise<void> {
  await runWrite(async (tx) => {
    const tables = await tx.read();

    if (!tables.students.some((row) => row.record.id === studentId)) {
      throw new RecordNotFoundError('students', studentId);
    }

    await tx.commit(await buildClassChange(tables, studentId, schoolYear, classId, reason, new Date()));
  });
}

/**
 * 모든 학생의 달란트를 0으로 만들고 달란트 변동 기록을 전부 지운다(관리자 초기화).
 */
export async function resetAllTalent(): Promise<void> {
  await runWrite(async (tx) => {
    const { students, talentTransactions } = await tx.read();
    const now = new Date();
    const updates: RowUpdate[] = [];

    for (const row of students) {
      updates.push(...(await toColumnUpdates('students', row.rowIndex, { currentTalent: 0, updatedAt: now })));
    }

    await tx.commit({ updates, deletes: await toDeletes('talentTransactions', talentTransactions) });
  });
}

// ---------------------------------------------------------------------------
// CSV 일괄 등록
// ---------------------------------------------------------------------------

export type ImportStudentRow = {
  name: string;
  gender: Gender;
  birthDate: Date;
  address: string;
  phone: string | null;
  note: string | null;
  guardianContact: { name: string; relationship: Relationship; phone: string } | null;
  /** 부서 이름(없으면 반 없이 등록) */
  departmentName: string | null;
  /** 반 이름 */
  className: string | null;
};

export type ImportResult = {
  createdStudentCount: number;
  skippedDuplicateCount: number;
  createdDepartmentNames: string[];
  createdClassNames: string[];
};

/**
 * CSV 행을 일괄 등록한다. 없는 부서·반은 옵션에 따라 만들고, 같은 이름+생년월일 학생은 건너뛴다.
 * 모든 행이 한 번의 쓰기로 반영되므로 중간에 실패해도 일부만 저장되지 않는다.
 */
export async function importStudents({
  rows,
  schoolYear,
  createMissingGroups,
}: {
  rows: ImportStudentRow[];
  schoolYear: number;
  createMissingGroups: boolean;
}): Promise<ImportResult> {
  return runWrite(async (tx) => {
    const tables = await tx.read();
    const now = new Date();
    const appends: RowAppend[] = [];
    const departments = tables.departments.map((row) => row.record);
    const classes = tables.classes.map((row) => row.record);
    const existingStudentKeys = new Set(
      tables.students.map((row) => `${row.record.name}|${row.record.birthDate.getTime()}`)
    );
    const createdDepartmentNames: string[] = [];
    const createdClassNames: string[] = [];
    let skippedDuplicateCount = 0;
    let createdStudentCount = 0;

    /**
     * 부서 이름으로 부서를 찾고, 없으면(옵션 허용 시) 만든다.
     */
    const resolveDepartment = async (name: string): Promise<DepartmentRecord> => {
      const found = departments.find((department) => department.name === name);

      if (found) {
        return found;
      }
      if (!createMissingGroups) {
        throw new InvalidWriteError(
          `부서 '${name}'이(가) 없습니다. 조직 관리에서 먼저 만들거나 자동 생성을 켜 주세요.`
        );
      }

      const created: DepartmentRecord = {
        id: randomUUID(),
        name,
        sortOrder: departments.reduce((max, department) => Math.max(max, department.sortOrder), 0) + 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      departments.push(created);
      createdDepartmentNames.push(name);
      appends.push(await toAppend('departments', created));
      return created;
    };

    /**
     * 부서 안에서 반 이름으로 반을 찾고, 없으면(옵션 허용 시) 만든다.
     */
    const resolveClass = async (department: DepartmentRecord, name: string): Promise<ClassRecord> => {
      const found = classes.find(
        (classRecord) =>
          classRecord.departmentId === department.id &&
          classRecord.schoolYear === schoolYear &&
          classRecord.name === name
      );

      if (found) {
        return found;
      }
      if (!createMissingGroups) {
        throw new InvalidWriteError(`${department.name} '${name}' 반이 ${schoolYear}학년도에 없습니다.`);
      }

      const siblings = classes.filter(
        (classRecord) => classRecord.departmentId === department.id && classRecord.schoolYear === schoolYear
      );
      const created: ClassRecord = {
        id: randomUUID(),
        departmentId: department.id,
        schoolYear,
        name,
        sortOrder: siblings.reduce((max, classRecord) => Math.max(max, classRecord.sortOrder), 0) + 1,
        teacherIds: [],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      classes.push(created);
      createdClassNames.push(`${department.name} ${name}`);
      appends.push(await toAppend('classes', created));
      return created;
    };

    for (const row of rows) {
      const duplicateKey = `${row.name}|${row.birthDate.getTime()}`;

      if (existingStudentKeys.has(duplicateKey)) {
        skippedDuplicateCount += 1;
        continue;
      }
      existingStudentKeys.add(duplicateKey);

      const student: StudentRecord = {
        id: randomUUID(),
        name: row.name,
        gender: row.gender,
        birthDate: row.birthDate,
        address: row.address,
        phone: row.phone,
        currentTalent: 0,
        createdAt: now,
        updatedAt: now,
        note: row.note,
        isNewFriend: false,
        firstVisitDate: null,
      };
      appends.push(await toAppend('students', student));
      createdStudentCount += 1;

      if (row.guardianContact) {
        appends.push(
          await toAppend('guardianContacts', {
            id: randomUUID(),
            studentId: student.id,
            ...row.guardianContact,
            createdAt: now,
            updatedAt: now,
          })
        );
      }

      if (row.departmentName && row.className) {
        const department = await resolveDepartment(row.departmentName);
        const classRecord = await resolveClass(department, row.className);
        appends.push(
          await toAppend(
            'enrollments',
            buildEnrollment(student.id, classRecord.id, schoolYear, EnrollmentReason.IMPORT, now)
          )
        );
      }
    }

    await tx.commit({ appends });

    return { createdStudentCount, skippedDuplicateCount, createdDepartmentNames, createdClassNames };
  });
}

// ---------------------------------------------------------------------------
// 출석 / 달란트
// ---------------------------------------------------------------------------

/**
 * 학생 1명과 그 학생의 출석 기록을 조회한다. 학생이 없으면 null.
 */
export async function findStudentAttendances(
  studentId: string
): Promise<{ student: StudentRecord; attendances: AttendanceRecord[] } | null> {
  const snapshot = await getStoreSnapshot();
  const student = snapshot.students.find((record) => record.id === studentId);

  if (!student) {
    return null;
  }

  return {
    student,
    attendances: snapshot.attendances.filter((attendance) => attendance.studentId === studentId),
  };
}

/**
 * 수동 달란트 조정을 반영하고 변경 후 누적 달란트, 금주 추가 달란트 합계를 반환한다.
 */
export async function adjustStudentTalent({
  studentId,
  amount,
  teacherId,
  weekStartDate,
  nextWeekStartDate,
}: {
  studentId: string;
  amount: number;
  teacherId: string;
  weekStartDate: Date;
  nextWeekStartDate: Date;
}): Promise<{
  student: StudentRecord;
  weeklyExtraTalent: number;
  transaction: TalentTransactionRecord;
}> {
  return runWrite(async (tx) => {
    const { students, talentTransactions } = await tx.read();
    const studentRow = students.find((row) => row.record.id === studentId);

    if (!studentRow) {
      throw new RecordNotFoundError('students', studentId);
    }

    const now = new Date();
    const nextTalent = studentRow.record.currentTalent + amount;
    const transaction: TalentTransactionRecord = {
      id: randomUUID(),
      studentId,
      teacherId,
      reason: TalentTransactionReason.MANUAL_ADJUST,
      transactedAt: now,
      amount,
      createdAt: now,
    };

    await tx.commit({
      updates: await toColumnUpdates('students', studentRow.rowIndex, { currentTalent: nextTalent, updatedAt: now }),
      appends: [await toAppend('talentTransactions', transaction)],
    });

    const weeklyExtraTalent = [...talentTransactions.map((row) => row.record), transaction]
      .filter(
        (record) =>
          record.studentId === studentId &&
          record.reason === TalentTransactionReason.MANUAL_ADJUST &&
          record.transactedAt >= weekStartDate &&
          record.transactedAt < nextWeekStartDate
      )
      .reduce((sum, record) => sum + record.amount, 0);

    return {
      student: { ...studentRow.record, currentTalent: nextTalent, updatedAt: now },
      weeklyExtraTalent,
      transaction,
    };
  });
}

/**
 * 현재 출석 상태가 기대값과 같을 때만 출석 상태를 바꾸고, 출석 연동 달란트(+1/-1)를 함께 반영한다.
 * 기대값과 다르면(다른 교사가 먼저 바꾼 경우) stale_state를 반환한다. 새로 만드는 출석 행에는 당시 소속 반을 기록한다.
 */
export async function setAttendanceStatusIfExpected({
  studentId,
  attendanceDate,
  expectedCurrentStatus,
  nextStatus,
  teacherId,
  schoolYear,
}: {
  studentId: string;
  attendanceDate: Date;
  expectedCurrentStatus: AttendanceStatusValue;
  nextStatus: AttendanceStatusValue;
  teacherId: string;
  schoolYear: number;
}): Promise<
  | { result: 'updated'; nextStatus: AttendanceStatusValue; currentTalent: number; talentDelta: number }
  | { result: 'stale_state' }
> {
  return runWrite(async (tx) => {
    const { students, attendances, enrollments } = await tx.read();
    const studentRow = students.find((row) => row.record.id === studentId);

    if (!studentRow) {
      throw new RecordNotFoundError('students', studentId);
    }

    const sameDayRows = attendances.filter(
      (row) => row.record.studentId === studentId && row.record.attendanceDate.getTime() === attendanceDate.getTime()
    );
    const [existingRow] = pickLatestAttendanceRows(sameDayRows);
    const currentStatus = existingRow?.record.status ?? AttendanceStatus.ABSENT;

    if (currentStatus !== expectedCurrentStatus || currentStatus === nextStatus) {
      return { result: 'stale_state' as const };
    }

    const now = new Date();
    const updates: RowUpdate[] = [];
    const appends: RowAppend[] = [];
    // 동시 저장으로 생긴 같은 날짜의 중복 출석 행은 이번 기회에 정리한다.
    const deletes = await toDeletes(
      'attendances',
      sameDayRows.filter((row) => row !== existingRow)
    );
    const classId = findActiveEnrollment(enrollments, studentId, schoolYear)?.record.classId ?? null;

    if (existingRow) {
      updates.push(
        ...(await toColumnUpdates('attendances', existingRow.rowIndex, {
          status: nextStatus,
          classId: existingRow.record.classId ?? classId,
          updatedAt: now,
        }))
      );
    } else {
      appends.push(
        await toAppend('attendances', {
          id: randomUUID(),
          studentId,
          attendanceDate,
          status: nextStatus,
          createdAt: now,
          updatedAt: now,
          classId,
        })
      );
    }

    const talentDelta = nextStatus === AttendanceStatus.PRESENT ? 1 : -1;
    const currentTalent = studentRow.record.currentTalent + talentDelta;

    updates.push(...(await toColumnUpdates('students', studentRow.rowIndex, { currentTalent, updatedAt: now })));
    appends.push(
      await toAppend('talentTransactions', {
        id: randomUUID(),
        studentId,
        teacherId,
        reason: TalentTransactionReason.ATTENDANCE,
        transactedAt: now,
        amount: talentDelta,
        createdAt: now,
      })
    );

    await tx.commit({ updates, appends, deletes });

    return { result: 'updated' as const, nextStatus, currentTalent, talentDelta };
  });
}

// ---------------------------------------------------------------------------
// 설정 / 부서 / 반 / 진급
// ---------------------------------------------------------------------------

/**
 * 설정 값을 저장한다(있으면 수정, 없으면 추가).
 */
export async function upsertSetting(key: string, value: string): Promise<void> {
  await runWrite(async (tx) => {
    const { settings } = await tx.read();
    const existingRow = settings.find((row) => row.record.key === key);
    const now = new Date();

    if (existingRow) {
      await tx.commit({ updates: await toColumnUpdates('settings', existingRow.rowIndex, { value, updatedAt: now }) });
      return;
    }

    await tx.commit({ appends: [await toAppend('settings', { key, value, updatedAt: now })] });
  });
}

/**
 * 부서를 만든다. 같은 이름이 있으면 거부한다.
 */
export async function createDepartment(name: string): Promise<DepartmentRecord> {
  return runWrite(async (tx) => {
    const { departments } = await tx.read();

    if (departments.some((row) => row.record.name === name)) {
      throw new InvalidWriteError('같은 이름의 부서가 이미 있습니다.');
    }

    const now = new Date();
    const department: DepartmentRecord = {
      id: randomUUID(),
      name,
      sortOrder: departments.reduce((max, row) => Math.max(max, row.record.sortOrder), 0) + 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await tx.commit({ appends: [await toAppend('departments', department)] });
    return department;
  });
}

/**
 * 부서 이름/순서/활성 여부를 수정한다.
 */
export async function updateDepartment(
  departmentId: string,
  changes: Partial<Pick<DepartmentRecord, 'name' | 'sortOrder' | 'isActive'>>
): Promise<void> {
  await runWrite(async (tx) => {
    const { departments } = await tx.read();
    const targetRow = departments.find((row) => row.record.id === departmentId);

    if (!targetRow) {
      throw new RecordNotFoundError('departments', departmentId);
    }
    if (changes.name && departments.some((row) => row.record.id !== departmentId && row.record.name === changes.name)) {
      throw new InvalidWriteError('같은 이름의 부서가 이미 있습니다.');
    }

    await tx.commit({
      updates: await toColumnUpdates('departments', targetRow.rowIndex, { ...changes, updatedAt: new Date() }),
    });
  });
}

/**
 * 반이 하나도 없는 부서만 삭제한다.
 */
export async function deleteDepartment(departmentId: string): Promise<void> {
  await runWrite(async (tx) => {
    const { departments, classes } = await tx.read();
    const targetRows = departments.filter((row) => row.record.id === departmentId);

    if (targetRows.length === 0) {
      throw new RecordNotFoundError('departments', departmentId);
    }
    if (classes.some((row) => row.record.departmentId === departmentId)) {
      throw new InvalidWriteError('반이 남아 있는 부서는 삭제할 수 없습니다. 반을 먼저 삭제해 주세요.');
    }

    await tx.commit({ deletes: await toDeletes('departments', targetRows) });
  });
}

/**
 * 부서에 학년도 반을 만든다. 같은 학년도·부서에 같은 이름이 있으면 거부한다.
 */
export async function createClass({
  departmentId,
  schoolYear,
  name,
  teacherIds,
}: {
  departmentId: string;
  schoolYear: number;
  name: string;
  teacherIds: string[];
}): Promise<ClassRecord> {
  return runWrite(async (tx) => {
    const { departments, classes } = await tx.read();

    if (!departments.some((row) => row.record.id === departmentId)) {
      throw new RecordNotFoundError('departments', departmentId);
    }

    const siblings = classes.filter(
      (row) => row.record.departmentId === departmentId && row.record.schoolYear === schoolYear
    );

    if (siblings.some((row) => row.record.name === name)) {
      throw new InvalidWriteError('같은 부서·학년도에 같은 이름의 반이 이미 있습니다.');
    }

    const now = new Date();
    const classRecord: ClassRecord = {
      id: randomUUID(),
      departmentId,
      schoolYear,
      name,
      sortOrder: siblings.reduce((max, row) => Math.max(max, row.record.sortOrder), 0) + 1,
      teacherIds,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await tx.commit({ appends: [await toAppend('classes', classRecord)] });
    return classRecord;
  });
}

/**
 * 반 이름/순서/담당 교사/활성 여부를 수정한다.
 */
export async function updateClass(
  classId: string,
  changes: Partial<Pick<ClassRecord, 'name' | 'sortOrder' | 'teacherIds' | 'isActive'>>
): Promise<void> {
  await runWrite(async (tx) => {
    const { classes } = await tx.read();
    const targetRow = classes.find((row) => row.record.id === classId);

    if (!targetRow) {
      throw new RecordNotFoundError('classes', classId);
    }
    if (
      changes.name &&
      classes.some(
        (row) =>
          row.record.id !== classId &&
          row.record.departmentId === targetRow.record.departmentId &&
          row.record.schoolYear === targetRow.record.schoolYear &&
          row.record.name === changes.name
      )
    ) {
      throw new InvalidWriteError('같은 부서·학년도에 같은 이름의 반이 이미 있습니다.');
    }

    await tx.commit({
      updates: await toColumnUpdates('classes', targetRow.rowIndex, { ...changes, updatedAt: new Date() }),
    });
  });
}

/**
 * 배정 이력이 없는 반만 삭제한다.
 */
export async function deleteClass(classId: string): Promise<void> {
  await runWrite(async (tx) => {
    const { classes, enrollments } = await tx.read();
    const targetRows = classes.filter((row) => row.record.id === classId);

    if (targetRows.length === 0) {
      throw new RecordNotFoundError('classes', classId);
    }
    if (enrollments.some((row) => row.record.classId === classId)) {
      throw new InvalidWriteError('학생 배정 이력이 있는 반은 삭제할 수 없습니다. 비활성 처리해 주세요.');
    }

    await tx.commit({ deletes: await toDeletes('classes', targetRows) });
  });
}

/**
 * 한 학년도의 반 구조(부서별 반 이름·순서·담당 교사)를 다른 학년도로 복사한다. 이미 같은 이름이 있는 반은 건너뛴다.
 */
export async function copyClassesToSchoolYear(sourceYear: number, targetYear: number): Promise<number> {
  return runWrite(async (tx) => {
    const { classes } = await tx.read();
    const targetClasses = classes.filter((row) => row.record.schoolYear === targetYear).map((row) => row.record);
    const now = new Date();
    const appends: RowAppend[] = [];

    for (const row of classes) {
      const source = row.record;

      if (source.schoolYear !== sourceYear || !source.isActive) {
        continue;
      }
      if (targetClasses.some((target) => target.departmentId === source.departmentId && target.name === source.name)) {
        continue;
      }

      appends.push(
        await toAppend('classes', {
          ...source,
          id: randomUUID(),
          schoolYear: targetYear,
          createdAt: now,
          updatedAt: now,
        })
      );
    }

    await tx.commit({ appends });
    return appends.length;
  });
}

export type PromotionMapping = {
  sourceClassId: string;
  /** null이면 새 학년도에 배정하지 않는다(졸업 등) */
  targetClassId: string | null;
};

/**
 * 학년 진급을 실행한다. 이전 학년도 반의 재학생을 매핑된 새 학년도 반으로 옮기고 이전 배정은 종료한다.
 * 이미 새 학년도 배정이 있는 학생은 건너뛰므로 두 번 실행해도 안전하다.
 */
export async function runPromotion({
  sourceYear,
  targetYear,
  mappings,
}: {
  sourceYear: number;
  targetYear: number;
  mappings: PromotionMapping[];
}): Promise<{ promotedCount: number; endedOnlyCount: number; skippedCount: number }> {
  return runWrite(async (tx) => {
    const tables = await tx.read();
    const targetClassBySourceClassId = new Map(
      mappings.map((mapping) => [mapping.sourceClassId, mapping.targetClassId])
    );
    const now = new Date();
    const updates: RowUpdate[] = [];
    const appends: RowAppend[] = [];
    let promotedCount = 0;
    let endedOnlyCount = 0;
    let skippedCount = 0;

    for (const enrollmentRow of tables.enrollments) {
      const enrollment = enrollmentRow.record;

      if (enrollment.schoolYear !== sourceYear || enrollment.status !== EnrollmentStatus.ACTIVE) {
        continue;
      }
      if (!targetClassBySourceClassId.has(enrollment.classId)) {
        continue;
      }
      if (findActiveEnrollment(tables.enrollments, enrollment.studentId, targetYear)) {
        skippedCount += 1;
        continue;
      }

      const targetClassId = targetClassBySourceClassId.get(enrollment.classId) ?? null;

      updates.push(
        ...(await toColumnUpdates('enrollments', enrollmentRow.rowIndex, {
          status: EnrollmentStatus.ENDED,
          endedAt: now,
          updatedAt: now,
        }))
      );

      if (targetClassId) {
        assertClassInYear(tables.classes, targetClassId, targetYear);
        appends.push(
          await toAppend(
            'enrollments',
            buildEnrollment(enrollment.studentId, targetClassId, targetYear, EnrollmentReason.PROMOTION, now)
          )
        );
        promotedCount += 1;
      } else {
        endedOnlyCount += 1;
      }
    }

    await tx.commit({ updates, appends });
    return { promotedCount, endedOnlyCount, skippedCount };
  });
}
