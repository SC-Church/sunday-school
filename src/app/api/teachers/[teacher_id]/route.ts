import { NextResponse } from 'next/server';

import { requireApprovedTeacher } from '@/lib/api-session';
import { toFieldErrorMap } from '@/lib/validation/student';
import { type TeacherUpdatePayload, parseTeacherUpdateInput } from '@/lib/validation/teacher';
import { updateTeacherProfile } from '@/server/db/repository';

type RouteContext = {
  params: Promise<{
    teacher_id: string;
  }>;
};

/**
 * 교사 정보를 수정한다. 관리자이거나 본인 계정일 때만 허용한다.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const guardResult = await requireApprovedTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const { teacher_id: teacherId } = await context.params;
  const isSelf = guardResult.teacherId === teacherId;

  if (!teacherId || (!guardResult.isAdmin && !isSelf)) {
    return NextResponse.json({ message: 'forbidden' }, { status: 403 });
  }

  let payload: Partial<TeacherUpdatePayload>;

  try {
    payload = (await request.json()) as Partial<TeacherUpdatePayload>;
  } catch {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  const parsedResult = parseTeacherUpdateInput(payload, guardResult.isAdmin);

  if (!parsedResult.success) {
    return NextResponse.json(
      { message: 'invalid_input', errors: toFieldErrorMap(parsedResult.error) },
      { status: 400 }
    );
  }

  const teacherInput = parsedResult.data;
  const birthDate = teacherInput.birth_date ? new Date(`${teacherInput.birth_date}T00:00:00+09:00`) : null;

  if (birthDate && Number.isNaN(birthDate.getTime())) {
    return NextResponse.json(
      { message: 'invalid_input', errors: { birth_date: '생년월일 형식이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }

  try {
    await updateTeacherProfile(teacherId, {
      name: teacherInput.name,
      phone: teacherInput.phone || null,
      birthDate,
      // 활성 상태는 관리자만 변경할 수 있어 일반 교사 요청에서는 필드를 건드리지 않는다.
      ...(guardResult.isAdmin ? { isActive: Boolean(teacherInput.is_active) } : {}),
    });
  } catch {
    return NextResponse.json({ message: 'server_error' }, { status: 500 });
  }

  return NextResponse.json({ message: 'ok' });
}
