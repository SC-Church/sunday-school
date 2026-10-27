import { NextResponse } from 'next/server';

import { requireApprovedTeacher } from '@/lib/api-session';
import { hashPassword, verifyPassword } from '@/lib/password';
import { type PasswordChangePayload, parsePasswordChangeInput } from '@/lib/validation/auth';
import { toFieldErrorMap } from '@/lib/validation/student';
import { findTeacherById, setTeacherPasswordHash } from '@/server/db/repository';

type RouteContext = {
  params: Promise<{
    teacher_id: string;
  }>;
};

/**
 * 본인 비밀번호를 변경한다. 관리자라도 다른 교사의 비밀번호는 여기서 바꿀 수 없다(관리자는 가입 관리의 초기화를 쓴다).
 */
export async function POST(request: Request, context: RouteContext) {
  const guardResult = await requireApprovedTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const { teacher_id: teacherId } = await context.params;

  if (!teacherId || guardResult.teacherId !== teacherId) {
    return NextResponse.json({ message: 'forbidden' }, { status: 403 });
  }

  let payload: Partial<PasswordChangePayload>;

  try {
    payload = (await request.json()) as Partial<PasswordChangePayload>;
  } catch {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  const parsedResult = parsePasswordChangeInput(payload);

  if (!parsedResult.success) {
    return NextResponse.json(
      { message: 'invalid_input', errors: toFieldErrorMap(parsedResult.error) },
      { status: 400 }
    );
  }

  try {
    const teacher = await findTeacherById(teacherId);

    if (!teacher?.passwordHash || !(await verifyPassword(parsedResult.data.current_password, teacher.passwordHash))) {
      return NextResponse.json(
        { message: 'invalid_input', errors: { current_password: '현재 비밀번호가 올바르지 않습니다.' } },
        { status: 400 }
      );
    }

    await setTeacherPasswordHash(teacherId, await hashPassword(parsedResult.data.new_password));
  } catch {
    return NextResponse.json({ message: 'server_error' }, { status: 500 });
  }

  return NextResponse.json({ message: 'ok' });
}
