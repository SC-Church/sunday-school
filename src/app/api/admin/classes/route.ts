import { NextResponse } from 'next/server';

import { readJsonBody, toErrorResponse } from '@/lib/api-errors';
import { requireAdminTeacher } from '@/lib/api-session';
import { groupNameSchema, idSchema, schoolYearSchema, teacherIdsSchema } from '@/lib/validation/organization';
import { copyClassesToSchoolYear, createClass, deleteClass, updateClass } from '@/server/db/repository';

type ClassRequestBody = {
  action?: 'create' | 'update' | 'delete' | 'copy_from_year';
  class_id?: string;
  department_id?: string;
  school_year?: number | string;
  source_school_year?: number | string;
  name?: string;
  sort_order?: number;
  teacher_ids?: string[];
  is_active?: boolean;
};

/**
 * 반 생성/수정/삭제와 학년도 간 반 구조 복사를 처리한다. 관리자 전용.
 */
export async function POST(request: Request) {
  const guardResult = await requireAdminTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const body = await readJsonBody<ClassRequestBody>(request);

  if (!body) {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  try {
    if (body.action === 'create') {
      const departmentId = idSchema.safeParse(body.department_id);
      const schoolYear = schoolYearSchema.safeParse(body.school_year);
      const name = groupNameSchema.safeParse(body.name);
      const teacherIds = teacherIdsSchema.safeParse(body.teacher_ids ?? []);

      if (!departmentId.success || !schoolYear.success || !name.success || !teacherIds.success) {
        return NextResponse.json(
          {
            message: 'invalid_input',
            detail: name.success ? '입력값을 확인해 주세요.' : name.error.issues[0]?.message,
          },
          { status: 400 }
        );
      }

      const classRecord = await createClass({
        departmentId: departmentId.data,
        schoolYear: schoolYear.data,
        name: name.data,
        teacherIds: teacherIds.data,
      });
      return NextResponse.json({ message: 'ok', class_id: classRecord.id });
    }

    if (body.action === 'copy_from_year') {
      const sourceYear = schoolYearSchema.safeParse(body.source_school_year);
      const targetYear = schoolYearSchema.safeParse(body.school_year);

      if (!sourceYear.success || !targetYear.success || sourceYear.data === targetYear.data) {
        return NextResponse.json({ message: 'invalid_input', detail: '학년도를 확인해 주세요.' }, { status: 400 });
      }

      const copiedCount = await copyClassesToSchoolYear(sourceYear.data, targetYear.data);
      return NextResponse.json({ message: 'ok', copied_count: copiedCount });
    }

    const classId = idSchema.safeParse(body.class_id);

    if (!classId.success) {
      return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
    }

    if (body.action === 'update') {
      const name = body.name !== undefined ? groupNameSchema.safeParse(body.name) : null;
      const teacherIds = body.teacher_ids !== undefined ? teacherIdsSchema.safeParse(body.teacher_ids) : null;

      if ((name && !name.success) || (teacherIds && !teacherIds.success)) {
        return NextResponse.json(
          {
            message: 'invalid_input',
            detail: name && !name.success ? name.error.issues[0]?.message : '담당 교사 값이 올바르지 않습니다.',
          },
          { status: 400 }
        );
      }

      await updateClass(classId.data, {
        ...(name?.success ? { name: name.data } : {}),
        ...(teacherIds?.success ? { teacherIds: teacherIds.data } : {}),
        ...(typeof body.sort_order === 'number' && Number.isInteger(body.sort_order)
          ? { sortOrder: body.sort_order }
          : {}),
        ...(typeof body.is_active === 'boolean' ? { isActive: body.is_active } : {}),
      });
      return NextResponse.json({ message: 'ok', class_id: classId.data });
    }

    if (body.action === 'delete') {
      await deleteClass(classId.data);
      return NextResponse.json({ message: 'ok', class_id: classId.data });
    }
  } catch (error) {
    return toErrorResponse(error);
  }

  return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
}
