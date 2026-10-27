import { describe, expect, it } from 'vitest';

import { buildBatchRequests, buildDeleteRequests, toCellData } from './sheet-requests';

describe('toCellData', () => {
  it('문자열은 stringValue로 넣어 수식이나 날짜로 해석되지 않게 한다', () => {
    expect(toCellData('=SUM(A1)')).toEqual({ userEnteredValue: { stringValue: '=SUM(A1)' } });
  });

  it('숫자/불리언은 각각의 타입 값으로 넣는다', () => {
    expect(toCellData(-1)).toEqual({ userEnteredValue: { numberValue: -1 } });
    expect(toCellData(false)).toEqual({ userEnteredValue: { boolValue: false } });
  });

  it('null과 빈 문자열은 셀을 비우는 빈 CellData가 된다', () => {
    expect(toCellData(null)).toEqual({});
    expect(toCellData('')).toEqual({});
  });
});

describe('buildDeleteRequests', () => {
  it('인접한 행은 하나의 범위로 합치고 아래쪽 범위부터 지운다', () => {
    const requests = buildDeleteRequests([
      { sheetId: 7, rowIndex: 2 },
      { sheetId: 7, rowIndex: 5 },
      { sheetId: 7, rowIndex: 3 },
      { sheetId: 7, rowIndex: 6 },
      { sheetId: 7, rowIndex: 9 },
    ]);

    expect(requests.map((request) => ('deleteDimension' in request ? request.deleteDimension.range : null))).toEqual([
      { sheetId: 7, dimension: 'ROWS', startIndex: 9, endIndex: 10 },
      { sheetId: 7, dimension: 'ROWS', startIndex: 5, endIndex: 7 },
      { sheetId: 7, dimension: 'ROWS', startIndex: 2, endIndex: 4 },
    ]);
  });

  it('같은 행이 중복으로 들어와도 한 번만 지운다', () => {
    const requests = buildDeleteRequests([
      { sheetId: 1, rowIndex: 4 },
      { sheetId: 1, rowIndex: 4 },
    ]);

    expect(requests).toHaveLength(1);
  });

  it('헤더 행(0행) 삭제 요청은 거부한다', () => {
    expect(() => buildDeleteRequests([{ sheetId: 1, rowIndex: 0 }])).toThrow();
  });

  it('삭제할 행이 없으면 요청도 없다', () => {
    expect(buildDeleteRequests([])).toEqual([]);
  });
});

describe('buildBatchRequests', () => {
  it('수정 → 추가 → 삭제 순서로 요청을 만들고 같은 시트의 추가는 하나로 묶는다', () => {
    const requests = buildBatchRequests({
      deletes: [{ sheetId: 1, rowIndex: 3 }],
      appends: [
        { sheetId: 2, cells: ['a'] },
        { sheetId: 2, cells: ['b'] },
      ],
      updates: [{ sheetId: 1, rowIndex: 5, columnIndex: 6, cells: [10] }],
    });

    expect(requests.map((request) => Object.keys(request)[0])).toEqual([
      'updateCells',
      'appendCells',
      'deleteDimension',
    ]);
    expect(requests[0]).toEqual({
      updateCells: {
        rows: [{ values: [{ userEnteredValue: { numberValue: 10 } }] }],
        fields: 'userEnteredValue',
        start: { sheetId: 1, rowIndex: 5, columnIndex: 6 },
      },
    });
    expect('appendCells' in requests[1] && requests[1].appendCells.rows).toHaveLength(2);
  });
});
