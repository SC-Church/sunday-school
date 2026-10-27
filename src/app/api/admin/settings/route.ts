import { NextResponse } from 'next/server';

import { readJsonBody, toErrorResponse } from '@/lib/api-errors';
import { requireAdminTeacher } from '@/lib/api-session';
import { churchNameSchema } from '@/lib/validation/organization';
import { upsertSetting } from '@/server/db/repository';
import { SETTING_KEY_CHURCH_NAME } from '@/server/db/sheet-schema';

/**
 * 교회 이름을 저장한다. 관리자 전용.
 */
export async function POST(request: Request) {
  const guardResult = await requireAdminTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const body = await readJsonBody<{ church_name?: string }>(request);
  const parsed = churchNameSchema.safeParse(body?.church_name);

  if (!parsed.success) {
    return NextResponse.json({ message: 'invalid_input', detail: parsed.error.issues[0]?.message }, { status: 400 });
  }

  try {
    await upsertSetting(SETTING_KEY_CHURCH_NAME, parsed.data);
  } catch (error) {
    return toErrorResponse(error);
  }

  return NextResponse.json({ message: 'ok', church_name: parsed.data });
}
