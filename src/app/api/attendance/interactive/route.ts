import { NextResponse } from 'next/server';

import { requireApprovedTeacher } from '@/lib/api-session';
import { parseClassScope } from '@/lib/attendance-display';
import { serializeInteractiveData } from '@/server/attendance/serialize';
import {
  TALENT_ADJUST_VALUES,
  getAttendanceInteractiveData,
  getAttendancePeriodInfo,
  updateAttendanceWithExpectedStatus,
  updateStudentTalent,
} from '@/server/attendance/service';
import { AttendanceStatus } from '@/types/domain';

type ToggleAttendanceRequestBody = {
  action: 'toggle_attendance';
  student_id?: string;
  expected_current_status?: AttendanceStatus;
  next_status?: AttendanceStatus;
};

type AdjustTalentRequestBody = {
  action: 'adjust_talent';
  student_id?: string;
  amount?: number;
};

/**
 * 출석 인터랙션 조회 API. class_id로 반(또는 all/unassigned)을 고른다.
 */
export async function GET(request: Request) {
  const guardResult = await requireApprovedTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const url = new URL(request.url);
  const scope = parseClassScope(url.searchParams.get('class_id') ?? undefined);
  const interactiveData = await getAttendanceInteractiveData(scope, guardResult.teacherId);

  return NextResponse.json(serializeInteractiveData(interactiveData));
}

/**
 * 출석/달란트 변경 API
 */
export async function POST(request: Request) {
  const guardResult = await requireApprovedTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  let body: ToggleAttendanceRequestBody | AdjustTalentRequestBody;

  try {
    body = (await request.json()) as ToggleAttendanceRequestBody | AdjustTalentRequestBody;
  } catch {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  const { attendanceDate, nextSundayDate } = getAttendancePeriodInfo();

  if (body.action === 'toggle_attendance') {
    if (
      !body.student_id ||
      (body.expected_current_status !== AttendanceStatus.PRESENT &&
        body.expected_current_status !== AttendanceStatus.ABSENT) ||
      (body.next_status !== AttendanceStatus.PRESENT && body.next_status !== AttendanceStatus.ABSENT)
    ) {
      return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
    }

    try {
      const result = await updateAttendanceWithExpectedStatus(
        body.student_id,
        attendanceDate,
        body.expected_current_status,
        body.next_status,
        guardResult.teacherId
      );

      if (result.result === 'stale_state') {
        return NextResponse.json({ message: 'stale_state' }, { status: 409 });
      }

      return NextResponse.json({
        message: 'ok',
        student_id: body.student_id,
        next_status: result.nextStatus,
        current_talent: result.currentTalent,
        talent_delta: result.talentDelta,
      });
    } catch {
      return NextResponse.json({ message: 'server_error' }, { status: 500 });
    }
  }

  if (body.action === 'adjust_talent') {
    const amountString = String(body.amount ?? '');
    if (!body.student_id || !TALENT_ADJUST_VALUES.has(amountString)) {
      return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
    }

    try {
      const updatedResult = await updateStudentTalent(
        body.student_id,
        Number(amountString),
        guardResult.teacherId,
        attendanceDate,
        nextSundayDate
      );

      return NextResponse.json({
        message: 'ok',
        student_id: updatedResult.studentId,
        student_name: updatedResult.studentName,
        current_talent: updatedResult.currentTalent,
        weekly_extra_talent: updatedResult.weeklyExtraTalent,
        transaction: {
          id: updatedResult.transaction.id,
          amount: updatedResult.transaction.amount,
          transacted_at: updatedResult.transaction.transactedAt.toISOString(),
          teacher: {
            name: guardResult.teacherName,
            email: guardResult.teacherEmail,
          },
        },
      });
    } catch {
      return NextResponse.json({ message: 'server_error' }, { status: 500 });
    }
  }

  return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
}
