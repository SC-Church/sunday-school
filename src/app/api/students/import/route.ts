import { NextResponse } from 'next/server';

import { readJsonBody, toErrorResponse } from '@/lib/api-errors';
import { requireAdminTeacher } from '@/lib/api-session';
import { schoolYearSchema } from '@/lib/validation/organization';
import { parseImportRecords } from '@/lib/validation/student-import';
import { importStudents } from '@/server/db/repository';
import { getSchoolYearInKst } from '@/utils/grade';

const IMPORT_MAX_ROWS = 500;

type ImportRequestBody = {
  records?: Record<string, string>[];
  school_year?: number | string;
  create_missing_groups?: boolean;
  /** true면 검증만 하고 저장하지 않는다(미리보기) */
  dry_run?: boolean;
};

/**
 * CSV에서 읽은 학생 행을 검증하고(미리보기) 일괄 등록한다. 관리자 전용.
 */
export async function POST(request: Request) {
  const guardResult = await requireAdminTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const body = await readJsonBody<ImportRequestBody>(request);

  if (!body || !Array.isArray(body.records)) {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }
  if (body.records.length === 0) {
    return NextResponse.json({ message: 'invalid_input', detail: '등록할 행이 없습니다.' }, { status: 400 });
  }
  if (body.records.length > IMPORT_MAX_ROWS) {
    return NextResponse.json(
      { message: 'invalid_input', detail: `한 번에 ${IMPORT_MAX_ROWS}행까지 등록할 수 있습니다.` },
      { status: 400 }
    );
  }

  const schoolYearResult = schoolYearSchema.safeParse(body.school_year ?? getSchoolYearInKst());

  if (!schoolYearResult.success) {
    return NextResponse.json({ message: 'invalid_input', detail: '학년도가 올바르지 않습니다.' }, { status: 400 });
  }

  const { rows, errors } = parseImportRecords(body.records);

  if (errors.length > 0 || body.dry_run) {
    return NextResponse.json({
      message: errors.length > 0 ? 'row_errors' : 'ok',
      valid_row_count: rows.length,
      errors,
    });
  }

  try {
    const result = await importStudents({
      rows,
      schoolYear: schoolYearResult.data,
      createMissingGroups: body.create_missing_groups !== false,
    });

    return NextResponse.json({
      message: 'ok',
      created_student_count: result.createdStudentCount,
      skipped_duplicate_count: result.skippedDuplicateCount,
      created_department_names: result.createdDepartmentNames,
      created_class_names: result.createdClassNames,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
