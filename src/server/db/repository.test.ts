import { describe, expect, it } from 'vitest';

import { pickLatestAttendanceRows } from './repository';
import type { AttendanceRecord } from './sheet-schema';

/**
 * 테스트용 출석 행을 만든다.
 */
function createAttendanceRow(
  rowIndex: number,
  studentId: string,
  attendanceDate: string,
  status: AttendanceRecord['status'],
  updatedAt: string
): { rowIndex: number; record: AttendanceRecord } {
  return {
    rowIndex,
    record: {
      id: `attendance-${rowIndex}`,
      studentId,
      attendanceDate: new Date(attendanceDate),
      status,
      createdAt: new Date(updatedAt),
      updatedAt: new Date(updatedAt),
      classId: null,
    },
  };
}

describe('pickLatestAttendanceRows', () => {
  it('같은 학생·같은 날짜 행이 여러 개면 가장 최근에 수정된 행만 남긴다', () => {
    const rows = [
      createAttendanceRow(1, 's1', '2026-09-27T00:00:00+09:00', 'PRESENT', '2026-09-27T10:00:00+09:00'),
      createAttendanceRow(2, 's1', '2026-09-27T00:00:00+09:00', 'ABSENT', '2026-09-27T10:05:00+09:00'),
    ];

    expect(pickLatestAttendanceRows(rows).map((row) => row.rowIndex)).toEqual([2]);
  });

  it('학생이나 날짜가 다르면 모두 유지한다', () => {
    const rows = [
      createAttendanceRow(1, 's1', '2026-09-20T00:00:00+09:00', 'PRESENT', '2026-09-20T10:00:00+09:00'),
      createAttendanceRow(2, 's1', '2026-09-27T00:00:00+09:00', 'PRESENT', '2026-09-27T10:00:00+09:00'),
      createAttendanceRow(3, 's2', '2026-09-27T00:00:00+09:00', 'ABSENT', '2026-09-27T10:00:00+09:00'),
    ];

    expect(pickLatestAttendanceRows(rows)).toHaveLength(3);
  });
});
