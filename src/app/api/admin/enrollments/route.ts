import { NextResponse } from 'next/server';

import { readJsonBody, toErrorResponse } from '@/lib/api-errors';
import { requireAdminTeacher } from '@/lib/api-session';
import { idSchema, schoolYearSchema } from '@/lib/validation/organization';
import { moveStudentToClass } from '@/server/db/repository';
import { EnrollmentReason } from '@/types/domain';

type EnrollmentRequestBody = {
  action?: 'move';
  student_id?: string;
  school_year?: number | string;
  /** null이면 미배정 처리 */
  class_id?: string | null;
};

/**
 * 학생을 다른 반으로 옮기거나 미배정 처리한다(부서 이동 포함). 관리자 전용.
 */
export async function POST(request: Request) {
  const guardResult = await requireAdminTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const body = await readJsonBody<EnrollmentRequestBody>(request);
  const studentId = idSchema.safeParse(body?.student_id);
  const schoolYear = schoolYearSchema.safeParse(body?.school_year);

  if (!body || body.action !== 'move' || !studentId.success || !schoolYear.success) {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  const classId = typeof body.class_id === 'string' && body.class_id.trim() ? body.class_id.trim() : null;

  try {
    await moveStudentToClass({
      studentId: studentId.data,
      schoolYear: schoolYear.data,
      classId,
      reason: EnrollmentReason.TRANSFER,
    });
  } catch (error) {
    return toErrorResponse(error);
  }

  return NextResponse.json({ message: 'ok', student_id: studentId.data, class_id: classId });
}
