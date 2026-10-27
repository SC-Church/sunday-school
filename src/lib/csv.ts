// CSV 파싱/생성 순수 함수. 엑셀에서 저장한 파일(따옴표, 줄바꿈 포함 셀, CRLF, BOM)을 다룬다.

/**
 * CSV 문자열을 2차원 문자열 배열로 파싱한다(RFC 4180 방식). 앞의 BOM은 무시하고 완전히 빈 줄은 건너뛴다.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let isInsideQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (isInsideQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          currentCell += '"';
          index += 1;
        } else {
          isInsideQuotes = false;
        }
      } else {
        currentCell += character;
      }
      continue;
    }

    if (character === '"') {
      isInsideQuotes = true;
    } else if (character === ',') {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (character === '\r') {
      // CRLF의 CR은 건너뛰고 LF에서 행을 끝낸다.
    } else if (character === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += character;
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim() !== ''));
}

/**
 * 헤더 행을 키로 하는 객체 배열로 변환한다. 헤더의 공백은 제거한다.
 */
export function parseCsvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const [headerRow, ...dataRows] = parseCsv(text);
  const headers = (headerRow ?? []).map((header) => header.trim());
  const records = dataRows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, (row[index] ?? '').trim()]))
  );

  return { headers, records };
}

/**
 * CSV 셀 값을 이스케이프한다.
 */
export function toCsvCell(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * 2차원 배열을 엑셀이 한글을 바로 읽는 CSV(UTF-8 BOM, CRLF)로 만든다.
 */
export function buildCsv(rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null>>): string {
  return `﻿${rows.map((row) => row.map(toCsvCell).join(',')).join('\r\n')}\r\n`;
}
