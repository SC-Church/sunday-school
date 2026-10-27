import { NextResponse } from 'next/server';

import { toErrorResponse } from '@/lib/api-errors';
import { requireApprovedTeacher } from '@/lib/api-session';
import { type StudentInputPayload, parseStudentInput, toFieldErrorMap } from '@/lib/validation/student';
import { deleteStudent, updateStudent } from '@/server/db/repository';
import { toStudentWriteInput } from '@/server/students/input';

type RouteContext = {
  params: Promise<{
    student_id: string;
  }>;
};

/**
 * 학생과 보호자 정보를 수정한다.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const guardResult = await requireApprovedTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const { student_id: studentId } = await context.params;

  if (!studentId) {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  let payload: Partial<StudentInputPayload>;

  try {
    payload = (await request.json()) as Partial<StudentInputPayload>;
  } catch {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  const parsedResult = parseStudentInput(payload);

  if (!parsedResult.success) {
    return NextResponse.json(
      { message: 'invalid_input', errors: toFieldErrorMap(parsedResult.error) },
      { status: 400 }
    );
  }

  const writeInput = toStudentWriteInput(parsedResult.data);

  if (!writeInput) {
    return NextResponse.json(
      { message: 'invalid_input', errors: { birth_date: '생년월일 형식이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }

  try {
    await updateStudent(studentId, writeInput);
  } catch (error) {
    return toErrorResponse(error);
  }

  return NextResponse.json({ message: 'ok' });
}

/**
 * 학생을 삭제한다.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const guardResult = await requireApprovedTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const { student_id: studentId } = await context.params;

  if (!studentId) {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  try {
    await deleteStudent(studentId);
  } catch (error) {
    return toErrorResponse(error);
  }

  return NextResponse.json({ message: 'ok' });
}
