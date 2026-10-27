import { requireAdminTeacher } from '@/lib/api-session';
import { buildCsv } from '@/lib/csv';
import { IMPORT_COLUMNS } from '@/lib/validation/student-import';

/**
 * CSV 일괄 등록 템플릿(헤더 + 예시 1행)을 내려준다. 엑셀에서 바로 열리도록 UTF-8 BOM을 붙인다.
 */
export async function GET() {
  const guardResult = await requireAdminTeacher();

  if (!guardResult.ok) {
    return guardResult.response;
  }

  const csv = buildCsv([
    [...IMPORT_COLUMNS],
    [
      '홍길동',
      '남',
      '2016-05-10',
      '010-1234-5678',
      '서울시 광진구',
      '홍보호',
      '모',
      '010-9876-5432',
      '땅콩 알레르기',
      '유년부',
      '4학년',
    ],
  ]);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('학생_일괄등록_템플릿.csv')}`,
    },
  });
}
