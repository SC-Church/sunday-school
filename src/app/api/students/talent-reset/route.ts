import { NextResponse } from 'next/server';

import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { resetAllTalent } from '@/server/db/repository';
import { TEACHER_APPROVAL_STATUS, TEACHER_ROLE } from '@/types/teacher';

/**
 * 관리자 전용 달란트/달란트 변동 기록 전체 초기화를 수행한다.
 */
export async function POST() {
  const session = await getServerSession(authOptions);

  if (
    !session?.user?.id ||
    session.user.role !== TEACHER_ROLE.ADMIN ||
    session.user.approvalStatus !== TEACHER_APPROVAL_STATUS.APPROVED
  ) {
    return NextResponse.json({ message: 'forbidden' }, { status: 403 });
  }

  try {
    await resetAllTalent();
  } catch {
    return NextResponse.json({ message: 'server_error' }, { status: 500 });
  }

  return NextResponse.json({ message: 'ok' });
}
