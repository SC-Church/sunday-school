import { NextResponse } from 'next/server';

import { readJsonBody, toErrorResponse } from '@/lib/api-errors';
import { requireAdminTeacher } from '@/lib/api-session';
import { groupNameSchema, idSchema } from '@/lib/validation/organization';
import { createDepartment, deleteDepartment, updateDepartment } from '@/server/db/repository';

type DepartmentRequestBody = {
  action?: 'create' | 'update' | 'delete';
  department_id?: string;
  name?: string;
  sort_order?: number;
  is_active?: boolean;
};

/**
 * 부서 생성/수정/삭제를 처리한다. 관리자 전용.
 */
export async function POST(request: Request) {
  const guardResult = await requireAdminTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const body = await readJsonBody<DepartmentRequestBody>(request);

  if (!body) {
    return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
  }

  try {
    if (body.action === 'create') {
      const name = groupNameSchema.safeParse(body.name);

      if (!name.success) {
        return NextResponse.json({ message: 'invalid_input', detail: name.error.issues[0]?.message }, { status: 400 });
      }

      const department = await createDepartment(name.data);
      return NextResponse.json({ message: 'ok', department_id: department.id, name: department.name });
    }

    const departmentId = idSchema.safeParse(body.department_id);

    if (!departmentId.success) {
      return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
    }

    if (body.action === 'update') {
      const name = body.name !== undefined ? groupNameSchema.safeParse(body.name) : null;

      if (name && !name.success) {
        return NextResponse.json({ message: 'invalid_input', detail: name.error.issues[0]?.message }, { status: 400 });
      }

      await updateDepartment(departmentId.data, {
        ...(name ? { name: name.data } : {}),
        ...(typeof body.sort_order === 'number' && Number.isInteger(body.sort_order)
          ? { sortOrder: body.sort_order }
          : {}),
        ...(typeof body.is_active === 'boolean' ? { isActive: body.is_active } : {}),
      });
      return NextResponse.json({ message: 'ok', department_id: departmentId.data });
    }

    if (body.action === 'delete') {
      await deleteDepartment(departmentId.data);
      return NextResponse.json({ message: 'ok', department_id: departmentId.data });
    }
  } catch (error) {
    return toErrorResponse(error);
  }

  return NextResponse.json({ message: 'invalid_request' }, { status: 400 });
}
