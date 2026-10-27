import type { CellValue } from './sheet-schema';

// spreadsheets.batchUpdate 요청 본문을 만드는 순수 함수 모음.
// batchUpdate는 요청을 지정한 순서대로, 하나라도 실패하면 전체를 적용하지 않는(원자적) 방식으로 처리한다.

type CellData = {
  userEnteredValue?: { stringValue: string } | { numberValue: number } | { boolValue: boolean };
};

export type SheetBatchRequest =
  | {
      updateCells: {
        rows: Array<{ values: CellData[] }>;
        fields: 'userEnteredValue';
        start: { sheetId: number; rowIndex: number; columnIndex: number };
      };
    }
  | {
      appendCells: {
        sheetId: number;
        rows: Array<{ values: CellData[] }>;
        fields: 'userEnteredValue';
      };
    }
  | {
      deleteDimension: {
        range: { sheetId: number; dimension: 'ROWS'; startIndex: number; endIndex: number };
      };
    };

export type RowUpdate = {
  sheetId: number;
  rowIndex: number;
  /** 값을 쓰기 시작할 컬럼 위치(0부터). 기본값 0 */
  columnIndex?: number;
  cells: CellValue[];
};

export type RowAppend = {
  sheetId: number;
  cells: CellValue[];
};

export type RowDelete = {
  sheetId: number;
  rowIndex: number;
};

/**
 * 셀 값을 Sheets API CellData로 변환한다. 문자열은 stringValue로 넣어 수식/날짜 자동 변환을 막는다.
 */
export function toCellData(value: CellValue): CellData {
  if (value === null || value === '') {
    // fields=userEnteredValue와 함께 빈 CellData를 보내면 셀 값이 지워진다.
    return {};
  }
  if (typeof value === 'number') {
    return { userEnteredValue: { numberValue: value } };
  }
  if (typeof value === 'boolean') {
    return { userEnteredValue: { boolValue: value } };
  }
  return { userEnteredValue: { stringValue: value } };
}

/**
 * 삭제할 행 목록을 시트별로 묶고, 인접한 행을 하나의 범위로 합친 뒤 아래쪽부터 지우는 요청으로 만든다.
 * 아래쪽부터 지워야 앞선 삭제가 뒤 요청의 행 번호를 밀어내지 않는다.
 */
export function buildDeleteRequests(deletes: ReadonlyArray<RowDelete>): SheetBatchRequest[] {
  const rowIndicesBySheetId = new Map<number, Set<number>>();

  deletes.forEach(({ sheetId, rowIndex }) => {
    if (rowIndex < 1) {
      throw new Error('헤더 행(0행)은 삭제할 수 없습니다.');
    }
    const rowIndices = rowIndicesBySheetId.get(sheetId) ?? new Set<number>();
    rowIndices.add(rowIndex);
    rowIndicesBySheetId.set(sheetId, rowIndices);
  });

  const requests: SheetBatchRequest[] = [];

  rowIndicesBySheetId.forEach((rowIndexSet, sheetId) => {
    const descendingRowIndices = [...rowIndexSet].sort((a, b) => b - a);
    let rangeEnd = descendingRowIndices[0] + 1;
    let rangeStart = descendingRowIndices[0];

    for (let index = 1; index <= descendingRowIndices.length; index += 1) {
      const rowIndex = descendingRowIndices[index];

      if (rowIndex !== undefined && rowIndex === rangeStart - 1) {
        rangeStart = rowIndex;
        continue;
      }

      requests.push({
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rangeStart, endIndex: rangeEnd },
        },
      });

      if (rowIndex !== undefined) {
        rangeStart = rowIndex;
        rangeEnd = rowIndex + 1;
      }
    }
  });

  return requests;
}

/**
 * 수정 → 추가 → 삭제 순서로 batchUpdate 요청 목록을 만든다.
 * 수정은 읽어 둔 행 번호를 그대로 쓰고, 추가는 마지막 데이터 행 뒤에 붙으며, 삭제는 아래쪽부터 진행하므로
 * 한 번의 호출 안에서 행 번호가 어긋나지 않는다.
 */
export function buildBatchRequests({
  updates = [],
  appends = [],
  deletes = [],
}: {
  updates?: ReadonlyArray<RowUpdate>;
  appends?: ReadonlyArray<RowAppend>;
  deletes?: ReadonlyArray<RowDelete>;
}): SheetBatchRequest[] {
  const updateRequests: SheetBatchRequest[] = updates.map((update) => ({
    updateCells: {
      rows: [{ values: update.cells.map(toCellData) }],
      fields: 'userEnteredValue',
      start: { sheetId: update.sheetId, rowIndex: update.rowIndex, columnIndex: update.columnIndex ?? 0 },
    },
  }));

  const appendRowsBySheetId = new Map<number, CellValue[][]>();
  appends.forEach((append) => {
    const rows = appendRowsBySheetId.get(append.sheetId) ?? [];
    rows.push(append.cells);
    appendRowsBySheetId.set(append.sheetId, rows);
  });

  const appendRequests: SheetBatchRequest[] = [...appendRowsBySheetId.entries()].map(([sheetId, rows]) => ({
    appendCells: {
      sheetId,
      rows: rows.map((cells) => ({ values: cells.map(toCellData) })),
      fields: 'userEnteredValue',
    },
  }));

  return [...updateRequests, ...appendRequests, ...buildDeleteRequests(deletes)];
}
