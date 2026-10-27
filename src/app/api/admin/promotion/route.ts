import { NextResponse } from 'next/server';

import { readJsonBody, toErrorResponse } from '@/lib/api-errors';
import { requireAdminTeacher } from '@/lib/api-session';
import { idSchema, schoolYearSchema } from '@/lib/validation/organization';
import { type PromotionMapping, runPromotion } from '@/server/db/repository';

type PromotionRequestBody = {
  source_school_year?: number | string;
  target_school_year?: number | string;
  mappings?: Array<{ source_class_id?: string; target_class_id?: string | null }>;
};

/**
 * 학년 진급을 실행한다. 관리자 전용.
 */
export async function POST(request: Request) {
  const guardResult = await requireAdminTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const body = await readJsonBody<PromotionRequestBody>(request);
  const sourceYear = schoolYearSchema.safeParse(body?.source_school_year);
  const targetYear = schoolYearSchema.safeParse(body?.target_school_year);

  if (!body || !sourceYear.success || !targetYear.success || !Array.isArray(body.mappings)) {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }
  if (targetYear.data <= sourceYear.data) {
    return NextResponse.json(
      { message: 'invalid_input', detail: '새 학년도는 이전 학년도보다 커야 합니다.' },
      { status: 400 }
    );
  }

  const mappings: PromotionMapping[] = [];

  for (const mapping of body.mappings) {
    const sourceClassId = idSchema.safeParse(mapping.source_class_id);

    if (!sourceClassId.success) {
      return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
    }

    mappings.push({
      sourceClassId: sourceClassId.data,
      targetClassId:
        typeof mapping.target_class_id === 'string' && mapping.target_class_id ? mapping.target_class_id : null,
    });
  }

  if (mappings.length === 0) {
    return NextResponse.json({ message: 'invalid_input', detail: '진급할 반 매핑이 없습니다.' }, { status: 400 });
  }

  try {
    const result = await runPromotion({ sourceYear: sourceYear.data, targetYear: targetYear.data, mappings });

    return NextResponse.json({
      message: 'ok',
      promoted_count: result.promotedCount,
      ended_only_count: result.endedOnlyCount,
      skipped_count: result.skippedCount,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
