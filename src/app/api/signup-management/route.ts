import { NextResponse } from 'next/server';

import { requireAdminTeacher } from '@/lib/api-session';
import { loginThrottle } from '@/lib/login-throttle';
import { generateTemporaryPassword, hashPassword } from '@/lib/password';
import {
  deleteTeacher,
  setTeacherPasswordHash,
  updateTeacherApproval,
  updateTeacherRole,
} from '@/server/db/repository';
import { TEACHER_APPROVAL_STATUS, TEACHER_ROLE } from '@/types/teacher';

type SignupManagementRequestBody = {
  action?: 'approve' | 'reject' | 'toggle_role' | 'delete' | 'reset_password';
  teacher_id?: string;
  next_role?: 'ADMIN' | 'TEACHER';
};

/**
 * 관리자 전용 가입 승인/거절/권한 변경/삭제/비밀번호 초기화를 처리한다.
 */
export async function POST(request: Request) {
  const guardResult = await requireAdminTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  let body: SignupManagementRequestBody;

  try {
    body = (await request.json()) as SignupManagementRequestBody;
  } catch {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  const teacherId = body.teacher_id;

  if (!teacherId) {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  if (body.action === 'approve' || body.action === 'reject') {
    const approvalStatus =
      body.action === 'approve' ? TEACHER_APPROVAL_STATUS.APPROVED : TEACHER_APPROVAL_STATUS.REJECTED;

    try {
      const updatedTeacher = await updateTeacherApproval(teacherId, approvalStatus);

      return NextResponse.json({
        message: 'ok',
        teacher: {
          id: updatedTeacher.id,
          name: updatedTeacher.name,
          email: updatedTeacher.email,
          approvalStatus: updatedTeacher.approvalStatus,
          role: updatedTeacher.role,
          processedAt: (updatedTeacher.approvalProcessedAt ?? updatedTeacher.updatedAt).toISOString(),
        },
      });
    } catch {
      return NextResponse.json({ message: 'server_error' }, { status: 500 });
    }
  }

  if (body.action === 'toggle_role') {
    const nextRole = body.next_role;

    if (nextRole !== TEACHER_ROLE.ADMIN && nextRole !== TEACHER_ROLE.TEACHER) {
      return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
    }

    if (teacherId === guardResult.teacherId && nextRole === TEACHER_ROLE.TEACHER) {
      return NextResponse.json({ message: 'self_protected' }, { status: 400 });
    }

    try {
      await updateTeacherRole(teacherId, nextRole);
    } catch {
      return NextResponse.json({ message: 'server_error' }, { status: 500 });
    }

    return NextResponse.json({ message: 'ok', teacher_id: teacherId, role: nextRole });
  }

  if (body.action === 'delete') {
    if (teacherId === guardResult.teacherId) {
      return NextResponse.json({ message: 'self_protected' }, { status: 400 });
    }

    try {
      await deleteTeacher(teacherId);
    } catch {
      return NextResponse.json({ message: 'server_error' }, { status: 500 });
    }

    return NextResponse.json({ message: 'ok', teacher_id: teacherId });
  }

  if (body.action === 'reset_password') {
    // 임시 비밀번호는 응답으로 한 번만 돌려주고 저장하지 않는다(시트에는 해시만 남는다).
    const temporaryPassword = generateTemporaryPassword();

    try {
      const updatedTeacher = await setTeacherPasswordHash(teacherId, await hashPassword(temporaryPassword));
      // 비밀번호를 잊어 로그인 실패로 잠긴 경우에도 임시 비밀번호로 바로 들어올 수 있게 잠금을 푼다.
      loginThrottle.reset(updatedTeacher.email.toLowerCase());
    } catch {
      return NextResponse.json({ message: 'server_error' }, { status: 500 });
    }

    return NextResponse.json({ message: 'ok', teacher_id: teacherId, temporary_password: temporaryPassword });
  }

  return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
}
