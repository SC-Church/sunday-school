import { NextResponse } from 'next/server';

import { toErrorResponse } from '@/lib/api-errors';
import { requireApprovedTeacher } from '@/lib/api-session';
import { type StudentInputPayload, parseStudentInput, toFieldErrorMap } from '@/lib/validation/student';
import { createStudent } from '@/server/db/repository';
import { toStudentWriteInput } from '@/server/students/input';

/**
 * 학생과 보호자 정보, 반 배정을 생성한다.
 */
export async function POST(request: Request) {
  const guardResult = await requireApprovedTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
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
    const createdStudent = await createStudent(writeInput);

    return NextResponse.json({ message: 'ok', student_id: createdStudent.id, student_name: createdStudent.name });
  } catch (error) {
    return toErrorResponse(error);
  }
}
