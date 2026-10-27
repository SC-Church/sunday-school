import { NextResponse } from 'next/server';

import { hashPassword } from '@/lib/password';
import { type SignupPayload, parseSignupInput } from '@/lib/validation/auth';
import { toFieldErrorMap } from '@/lib/validation/student';
import { createTeacherAccount } from '@/server/db/repository';

/**
 * 교사 회원가입을 처리한다. 가입한 계정은 관리자가 승인할 때까지 승인 대기 상태다.
 * 로그인 전 공개 경로이므로 src/proxy.ts에서 인증 검사를 건너뛴다.
 */
export async function POST(request: Request) {
  let payload: Partial<SignupPayload>;

  try {
    payload = (await request.json()) as Partial<SignupPayload>;
  } catch {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  const parsedResult = parseSignupInput(payload);

  if (!parsedResult.success) {
    return NextResponse.json(
      { message: 'invalid_input', errors: toFieldErrorMap(parsedResult.error) },
      { status: 400 }
    );
  }

  const signupInput = parsedResult.data;

  try {
    const result = await createTeacherAccount({
      email: signupInput.email,
      name: signupInput.name,
      passwordHash: await hashPassword(signupInput.password),
    });

    if (result.result === 'email_taken') {
      return NextResponse.json(
        {
          message: 'email_taken',
          errors: { email: '이미 등록된 이메일입니다. 비밀번호를 잊으셨다면 관리자에게 초기화를 요청해 주세요.' },
        },
        { status: 409 }
      );
    }
  } catch {
    return NextResponse.json({ message: 'server_error' }, { status: 500 });
  }

  return NextResponse.json({ message: 'ok' }, { status: 201 });
}
