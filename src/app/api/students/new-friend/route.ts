import { NextResponse } from 'next/server';

import { readJsonBody, toErrorResponse } from '@/lib/api-errors';
import { requireApprovedTeacher } from '@/lib/api-session';
import { type StudentInputPayload, parseStudentInput, toFieldErrorMap } from '@/lib/validation/student';
import { createStudent } from '@/server/db/repository';
import { toStudentWriteInput } from '@/server/students/input';
import { formatDateToKoreanYmd } from '@/utils/date';

type NewFriendPayload = Pick<StudentInputPayload, 'name' | 'gender' | 'birth_date' | 'phone' | 'class_id'>;

/**
 * 출석 화면에서 새친구를 빠르게 등록한다(이름·성별·생년월일·반만 받고 나머지는 나중에 채운다).
 * 첫 방문일은 오늘이며 새친구 표시가 켜진다.
 */
export async function POST(request: Request) {
  const guardResult = await requireApprovedTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const payload = await readJsonBody<Partial<NewFriendPayload>>(request);

  if (!payload) {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  const parsedResult = parseStudentInput({
    ...payload,
    address: '-',
    is_new_friend: true,
    first_visit_date: formatDateToKoreanYmd(new Date()),
  });

  if (!parsedResult.success) {
    return NextResponse.json(
      { message: 'invalid_input', errors: toFieldErrorMap(parsedResult.error) },
      { status: 400 }
    );
  }

  const writeInput = toStudentWriteInput({ ...parsedResult.data, address: '' });

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
