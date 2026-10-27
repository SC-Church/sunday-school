import { NextResponse } from 'next/server';

import { toErrorResponse } from '@/lib/api-errors';
import { requireApprovedTeacher } from '@/lib/api-session';
import { settleNewFriend } from '@/server/db/repository';

type RouteContext = {
  params: Promise<{
    student_id: string;
  }>;
};

/**
 * 새친구를 정착(일반 학생)으로 처리한다.
 */
export async function POST(_request: Request, context: RouteContext) {
  const guardResult = await requireApprovedTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const { student_id: studentId } = await context.params;

  if (!studentId) {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  try {
    await settleNewFriend(studentId);
  } catch (error) {
    return toErrorResponse(error);
  }

  return NextResponse.json({ message: 'ok', student_id: studentId });
}
