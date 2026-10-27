import { NextResponse } from 'next/server';

import { InvalidWriteError, RecordNotFoundError } from '@/server/db/repository';

/**
 * 저장소 오류를 API 응답으로 바꾼다. 입력 오류는 400, 대상 없음은 404, 나머지는 500.
 */
export function toErrorResponse(error: unknown): NextResponse<{ message: string; detail?: string }> {
  if (error instanceof InvalidWriteError) {
    return NextResponse.json({ message: 'invalid_input', detail: error.message }, { status: 400 });
  }
  if (error instanceof RecordNotFoundError) {
    return NextResponse.json({ message: 'not_found', detail: error.message }, { status: 404 });
  }

  return NextResponse.json({ message: 'server_error' }, { status: 500 });
}

/**
 * 요청 본문을 JSON으로 읽는다. 실패하면 null.
 */
export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
