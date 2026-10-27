/**
 * Google Sheets 저장소 준비/이전 스크립트.
 *
 *   yarn sheets:init      탭(teachers 등 5개)과 헤더 행을 만든다. 기존 데이터는 건드리지 않는다.
 *   yarn sheets:init      (스키마에 컬럼이 추가된 경우) 기존 헤더 뒤에 새 컬럼 이름을 이어 붙인다.
 *   yarn sheets:make-admin <이메일>  가입한 교사를 승인된 관리자로 지정한다(첫 관리자 지정용).
 *   yarn sheets:migrate   Neon(Postgres) 데이터를 CSV로 백업(backups/)한 뒤 빈 시트로 옮긴다.
 *                         DATABASE_URL이 필요하며, 대상 탭에 데이터가 이미 있으면 중단한다.
 *
 * 환경변수는 .env.local에서 읽는다(APPS_SCRIPT_URL, APPS_SCRIPT_TOKEN, migrate 시 DATABASE_URL).
 * 스프레드시트에 apps-script/Code.gs를 붙여 웹 앱으로 배포한 뒤 실행한다.
 */
import pg from 'pg';

import { normalizeEmail } from '@/lib/validation/auth';
import { promoteTeacherToAdminByEmail } from '@/server/db/repository';
import { buildBatchRequests } from '@/server/db/sheet-requests';
import {
  type CellValue,
  SHEET_TABLES,
  type SheetTable,
  type SheetTableKey,
  parseTableValues,
  serializeRecord,
} from '@/server/db/sheet-schema';
import { clearSheetIdCache, getSheetIdByTitle, readSheets, writeSheets } from '@/server/db/sheets-client';

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TABLE_KEYS = Object.keys(SHEET_TABLES) as SheetTableKey[];

/** Prisma가 만든 Postgres 테이블 이름(모델명 그대로). 없는 탭(부서·반 등 새 구조)은 빈 상태로 시작한다. */
const POSTGRES_TABLE_BY_KEY: Partial<Record<SheetTableKey, string>> = {
  teachers: 'Teacher',
  students: 'Student',
  guardianContacts: 'GuardianContact',
  attendances: 'Attendance',
  talentTransactions: 'TalentTransaction',
};

const APPEND_CHUNK_SIZE = 500;
// PostgreSQL timestamp without time zone 타입 OID. Prisma는 이 타입에 UTC 값을 저장한다.
const POSTGRES_TIMESTAMP_OID = 1114;

type AnyTable = SheetTable<Record<string, unknown>>;

/**
 * 테이블 키로 스키마 정의를 가져온다(레코드 타입을 느슨하게 다루기 위한 헬퍼).
 */
function getTable(key: SheetTableKey): AnyTable {
  return SHEET_TABLES[key] as unknown as AnyTable;
}

/**
 * 스키마의 모든 탭 값을 한 번에 읽는다. 없는 탭은 빈 배열로 취급한다.
 */
async function readAllTableValues(): Promise<string[][][]> {
  const { valueRanges } = await readSheets(TABLE_KEYS.map((key) => getTable(key).title));
  return valueRanges.map((values) => values ?? []);
}

/**
 * 없는 탭을 추가하고, 비어 있는 탭에는 헤더 행을 쓴다. 헤더가 스키마와 다르면 오류로 중단한다.
 */
async function ensureTabsAndHeaders(): Promise<void> {
  clearSheetIdCache();
  const existingTitles = await getSheetIdByTitle();
  const missingKeys = TABLE_KEYS.filter((key) => !existingTitles.has(getTable(key).title));

  if (missingKeys.length > 0) {
    await writeSheets(
      missingKeys.map((key) => ({ addSheet: { properties: { title: getTable(key).title } } })),
      null
    );
    clearSheetIdCache();
    console.log(`탭 추가: ${missingKeys.map((key) => getTable(key).title).join(', ')}`);
  }

  const sheetIdByTitle = await getSheetIdByTitle();
  const valuesByTable = await readAllTableValues();
  const headerUpdates = TABLE_KEYS.flatMap((key, index) => {
    const table = getTable(key);

    const sheetId = sheetIdByTitle.get(table.title)!;

    if (valuesByTable[index].length === 0) {
      return [{ sheetId, rowIndex: 0, cells: [...table.columnNames] }];
    }

    const existingHeader = (valuesByTable[index][0] ?? []).map((cell) => cell.trim()).filter(Boolean);
    const isOlderPrefix =
      existingHeader.length < table.columnNames.length &&
      existingHeader.every((columnName, columnIndex) => columnName === table.columnNames[columnIndex]);

    if (isOlderPrefix) {
      // 스키마 끝에 새 컬럼이 추가된 경우(예: teachers.passwordHash) 헤더 뒤에 이어 붙인다. 기존 행은 빈 값으로 읽힌다.
      const missingColumns = table.columnNames.slice(existingHeader.length);
      console.log(`컬럼 추가: ${table.title} ← ${missingColumns.join(', ')}`);
      return [{ sheetId, rowIndex: 0, columnIndex: existingHeader.length, cells: [...missingColumns] }];
    }

    // 이미 최신 헤더면 형식만 확인한다(틀리면 parseTableValues가 오류를 던진다).
    parseTableValues(table, valuesByTable[index]);
    return [];
  });

  await writeSheets(buildBatchRequests({ updates: headerUpdates }), null);
  console.log(
    headerUpdates.length > 0
      ? `헤더 작성/갱신: ${headerUpdates.length}개 탭`
      : '모든 탭의 헤더가 이미 준비되어 있습니다.'
  );
}

/**
 * CSV 셀 값을 이스케이프한다.
 */
function toCsvCell(value: CellValue): string {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Neon(Postgres)에서 모든 테이블을 읽어 시트 레코드 형태의 셀 배열로 변환한다.
 */
async function readPostgresRows(databaseUrl: string): Promise<Record<SheetTableKey, CellValue[][]>> {
  // pg는 기본적으로 timestamp(시간대 없음)를 실행 PC의 로컬 시간으로 해석하므로 UTC로 강제한다.
  pg.types.setTypeParser(POSTGRES_TIMESTAMP_OID, (value) => new Date(`${value.replace(' ', 'T')}Z`));

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = {} as Record<SheetTableKey, CellValue[][]>;

    for (const key of TABLE_KEYS) {
      const table = getTable(key);
      const postgresTable = POSTGRES_TABLE_BY_KEY[key];

      if (!postgresTable) {
        result[key] = [];
        continue;
      }

      const { rows } = await client.query<Record<string, unknown>>(
        `SELECT * FROM "${postgresTable}" ORDER BY "createdAt" ASC, "id" ASC`
      );

      result[key] = rows.map((row) => {
        const record = Object.fromEntries(table.columnNames.map((columnName) => [columnName, row[columnName] ?? null]));
        return serializeRecord(table, record);
      });

      // 시트에 쓰기 전에 앱이 다시 읽을 수 있는 값인지 검증한다(헤더 + 데이터로 파싱해 본다).
      parseTableValues(table, [
        [...table.columnNames],
        ...result[key].map((cells) => cells.map((cell) => (cell === null ? '' : String(cell)))),
      ]);
      console.log(`Neon 조회: ${postgresTable} ${rows.length}건`);
    }

    return result;
  } finally {
    await client.end();
  }
}

/**
 * 변환한 데이터를 backups/neon-export-<시각>/ 아래 CSV(UTF-8 BOM, 엑셀 호환)로 저장한다.
 */
function writeCsvBackups(rowsByTable: Record<SheetTableKey, CellValue[][]>): string {
  const backupDir = join(process.cwd(), 'backups', `neon-export-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(backupDir, { recursive: true });

  TABLE_KEYS.forEach((key) => {
    const table = getTable(key);
    const lines = [table.columnNames, ...rowsByTable[key]].map((cells) => cells.map(toCsvCell).join(','));
    writeFileSync(join(backupDir, `${table.title}.csv`), `﻿${lines.join('\r\n')}\r\n`, 'utf8');
  });

  return backupDir;
}

/**
 * Neon 데이터를 CSV로 백업하고 빈 시트 탭에 옮긴다.
 */
async function migrateFromPostgres(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL이 없습니다. .env.local에 기존 Neon 연결 문자열을 넣어 주세요.');
  }

  await ensureTabsAndHeaders();

  const valuesByTable = await readAllTableValues();
  const nonEmptyTitles = TABLE_KEYS.filter(
    (key, index) => parseTableValues(getTable(key), valuesByTable[index]).length > 0
  ).map((key) => getTable(key).title);

  if (nonEmptyTitles.length > 0) {
    throw new Error(`이미 데이터가 있는 탭이 있어 중단합니다: ${nonEmptyTitles.join(', ')} (중복 이전 방지)`);
  }

  const rowsByTable = await readPostgresRows(databaseUrl);
  const backupDir = writeCsvBackups(rowsByTable);
  console.log(`CSV 백업 저장: ${backupDir}`);

  const sheetIdByTitle = await getSheetIdByTitle();

  for (const key of TABLE_KEYS) {
    const table = getTable(key);
    const sheetId = sheetIdByTitle.get(table.title)!;
    const rows = rowsByTable[key];

    for (let start = 0; start < rows.length; start += APPEND_CHUNK_SIZE) {
      const chunk = rows.slice(start, start + APPEND_CHUNK_SIZE);
      await writeSheets(buildBatchRequests({ appends: chunk.map((cells) => ({ sheetId, cells })) }), null);
    }

    console.log(`시트 기록: ${table.title} ${rows.length}건`);
  }

  // 옮긴 결과를 앱과 같은 방식으로 다시 읽어 건수를 대조한다.
  const verifiedValues = await readAllTableValues();
  TABLE_KEYS.forEach((key, index) => {
    const parsedCount = parseTableValues(getTable(key), verifiedValues[index]).length;

    if (parsedCount !== rowsByTable[key].length) {
      throw new Error(`${getTable(key).title} 건수 불일치: Neon ${rowsByTable[key].length}건 / 시트 ${parsedCount}건`);
    }
  });

  console.log('이전 완료: 모든 탭의 건수가 Neon과 일치합니다.');
}

/**
 * 가입한 교사를 승인된 관리자로 지정한다. 첫 관리자를 만들 때 쓴다(가입은 이메일 소유를 확인하지 않으므로 자동 지정하지 않음).
 */
async function makeAdmin(emailArgument: string | undefined): Promise<void> {
  const email = normalizeEmail(emailArgument);

  if (!email) {
    throw new Error('관리자로 지정할 이메일을 입력해 주세요. 예: yarn sheets:make-admin teacher@example.com');
  }

  const teacher = await promoteTeacherToAdminByEmail(email);
  console.log(`관리자 지정 완료: ${teacher.name ?? '(이름 없음)'} <${teacher.email}>`);
  console.log('이미 로그인해 있다면 최대 5분 뒤 또는 다시 로그인하면 관리자 메뉴가 보입니다.');
}

/**
 * 명령행 인자에 따라 init/migrate를 실행한다.
 */
async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === 'init') {
    await ensureTabsAndHeaders();
    return;
  }

  if (command === 'migrate') {
    await migrateFromPostgres();
    return;
  }

  if (command === 'make-admin') {
    await makeAdmin(process.argv[3]);
    return;
  }

  console.error('사용법: tsx scripts/sheets-setup.ts <init|migrate|make-admin 이메일>');
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
