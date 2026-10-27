import { describe, expect, it } from 'vitest';

import { SHEET_TABLES, SheetDataError, type StudentRecord, parseTableValues, serializeRecord } from './sheet-schema';

const STUDENT_HEADER = [...SHEET_TABLES.students.columnNames];

const sampleStudent: StudentRecord = {
  id: 'student-1',
  name: '김철수',
  gender: 'MALE',
  birthDate: new Date('2016-05-09T15:00:00.000Z'),
  address: '서울시',
  phone: null,
  currentTalent: -2,
  createdAt: new Date('2026-03-01T01:00:00.000Z'),
  updatedAt: new Date('2026-03-01T01:00:00.000Z'),
  note: null,
  isNewFriend: false,
  firstVisitDate: null,
};

/**
 * 직렬화한 셀 값을 시트 FORMATTED_VALUE 응답처럼 문자열로 바꾼다.
 */
function toFormattedRow(cells: ReturnType<typeof serializeRecord>): string[] {
  return cells.map((cell) =>
    cell === null ? '' : typeof cell === 'boolean' ? String(cell).toUpperCase() : String(cell)
  );
}

describe('serializeRecord / parseTableValues', () => {
  it('직렬화한 학생 레코드를 다시 파싱하면 원래 값과 같다', () => {
    const cells = serializeRecord(SHEET_TABLES.students, sampleStudent);
    const [parsedRow] = parseTableValues(SHEET_TABLES.students, [STUDENT_HEADER, toFormattedRow(cells)]);

    expect(parsedRow.rowIndex).toBe(1);
    expect(parsedRow.record).toEqual(sampleStudent);
  });

  it('날짜는 한국시간 오프셋 문자열로 저장한다', () => {
    const cells = serializeRecord(SHEET_TABLES.students, sampleStudent);
    expect(cells[STUDENT_HEADER.indexOf('birthDate')]).toBe('2016-05-10T00:00:00.000+09:00');
  });

  it('교사의 TRUE/FALSE 값과 빈 선택 값을 올바르게 읽는다', () => {
    const header = [...SHEET_TABLES.teachers.columnNames];
    const row = [
      't-1',
      'a@b.com',
      '',
      '',
      '',
      '',
      'TEACHER',
      'PENDING',
      '',
      'FALSE',
      '2026-03-01T00:00:00.000+09:00',
      '2026-03-01T00:00:00.000+09:00',
    ];
    const [parsedRow] = parseTableValues(SHEET_TABLES.teachers, [header, row]);

    expect(parsedRow.record.isActive).toBe(false);
    expect(parsedRow.record.name).toBeNull();
    expect(parsedRow.record.birthDate).toBeNull();
    // 비밀번호 컬럼이 추가되기 전 행(뒤쪽 셀 없음)도 비밀번호 없는 계정으로 읽는다.
    expect(parsedRow.record.passwordHash).toBeNull();
  });

  it('완전히 빈 행은 건너뛰되 뒤 행의 행 번호는 유지한다', () => {
    const cells = toFormattedRow(serializeRecord(SHEET_TABLES.students, sampleStudent));
    const rows = parseTableValues(SHEET_TABLES.students, [STUDENT_HEADER, [], ['', ''], cells]);

    expect(rows).toHaveLength(1);
    expect(rows[0].rowIndex).toBe(3);
  });

  it('뒤쪽 빈 셀이 생략된 행도 빈 값으로 채워 읽는다', () => {
    const cells = toFormattedRow(
      serializeRecord(SHEET_TABLES.talentTransactions, {
        id: 'tx-1',
        studentId: 'student-1',
        teacherId: null,
        reason: null,
        transactedAt: new Date('2026-03-01T01:00:00.000Z'),
        amount: 3,
        createdAt: new Date('2026-03-01T01:00:00.000Z'),
      })
    );
    const [parsedRow] = parseTableValues(SHEET_TABLES.talentTransactions, [
      [...SHEET_TABLES.talentTransactions.columnNames],
      cells,
    ]);

    expect(parsedRow.record.teacherId).toBeNull();
    expect(parsedRow.record.reason).toBeNull();
    expect(parsedRow.record.amount).toBe(3);
  });

  it('컬럼이 추가되기 전 학생 행(9칸)도 새친구 아님·특이사항 없음으로 읽는다', () => {
    const legacyCells = toFormattedRow(serializeRecord(SHEET_TABLES.students, sampleStudent)).slice(0, 9);
    const [parsedRow] = parseTableValues(SHEET_TABLES.students, [STUDENT_HEADER, legacyCells]);

    expect(parsedRow.record.isNewFriend).toBe(false);
    expect(parsedRow.record.note).toBeNull();
    expect(parsedRow.record.firstVisitDate).toBeNull();
  });

  it('반의 교사 id 목록은 쉼표로 저장하고 다시 배열로 읽는다', () => {
    const classRecord = {
      id: 'class-1',
      departmentId: 'dept-1',
      schoolYear: 2026,
      name: '1반',
      sortOrder: 1,
      teacherIds: ['t-1', 't-2'],
      isActive: true,
      createdAt: new Date('2026-03-01T01:00:00.000Z'),
      updatedAt: new Date('2026-03-01T01:00:00.000Z'),
    };
    const cells = serializeRecord(SHEET_TABLES.classes, classRecord);
    expect(cells[[...SHEET_TABLES.classes.columnNames].indexOf('teacherIds')]).toBe('t-1,t-2');

    const [parsedRow] = parseTableValues(SHEET_TABLES.classes, [
      [...SHEET_TABLES.classes.columnNames],
      toFormattedRow(cells),
    ]);
    expect(parsedRow.record).toEqual(classRecord);

    const noTeacherCells = toFormattedRow(serializeRecord(SHEET_TABLES.classes, { ...classRecord, teacherIds: [] }));
    expect(
      parseTableValues(SHEET_TABLES.classes, [[...SHEET_TABLES.classes.columnNames], noTeacherCells])[0].record
        .teacherIds
    ).toEqual([]);
  });

  it('헤더 순서가 스키마와 다르면 오류를 던진다', () => {
    const swappedHeader = [...STUDENT_HEADER];
    [swappedHeader[0], swappedHeader[1]] = [swappedHeader[1], swappedHeader[0]];

    expect(() => parseTableValues(SHEET_TABLES.students, [swappedHeader])).toThrow(SheetDataError);
  });

  it('헤더 뒤에 사람이 추가한 컬럼은 허용한다', () => {
    expect(() => parseTableValues(SHEET_TABLES.students, [[...STUDENT_HEADER, '메모']])).not.toThrow();
  });

  it('헤더 행이 없으면 오류를 던진다', () => {
    expect(() => parseTableValues(SHEET_TABLES.students, [])).toThrow(/헤더/);
  });

  it('허용되지 않은 enum 값은 탭/행/컬럼 위치와 함께 오류를 던진다', () => {
    const cells = toFormattedRow(serializeRecord(SHEET_TABLES.students, sampleStudent));
    cells[STUDENT_HEADER.indexOf('gender')] = '남';

    expect(() => parseTableValues(SHEET_TABLES.students, [STUDENT_HEADER, cells])).toThrow(
      "'students' 탭 2행 gender 컬럼"
    );
  });

  it('필수 값이 비어 있거나 정수가 아니면 오류를 던진다', () => {
    const emptyNameCells = toFormattedRow(serializeRecord(SHEET_TABLES.students, sampleStudent));
    emptyNameCells[STUDENT_HEADER.indexOf('name')] = '';
    const decimalTalentCells = toFormattedRow(serializeRecord(SHEET_TABLES.students, sampleStudent));
    decimalTalentCells[STUDENT_HEADER.indexOf('currentTalent')] = '1.5';

    expect(() => parseTableValues(SHEET_TABLES.students, [STUDENT_HEADER, emptyNameCells])).toThrow(SheetDataError);
    expect(() => parseTableValues(SHEET_TABLES.students, [STUDENT_HEADER, decimalTalentCells])).toThrow(SheetDataError);
  });

  it('천 단위 쉼표가 표시된 정수도 읽는다', () => {
    const cells = toFormattedRow(serializeRecord(SHEET_TABLES.students, sampleStudent));
    cells[STUDENT_HEADER.indexOf('currentTalent')] = '1,200';

    const [parsedRow] = parseTableValues(SHEET_TABLES.students, [STUDENT_HEADER, cells]);
    expect(parsedRow.record.currentTalent).toBe(1200);
  });
});
