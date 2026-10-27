import type { StudentInput } from '@/lib/validation/student';
import { parseKstBirthDate } from '@/lib/validation/student';
import type { StudentWriteInput } from '@/server/db/repository';
import { getSchoolYearInKst } from '@/utils/grade';

/**
 * 검증을 통과한 학생 입력값을 저장소 쓰기 입력으로 변환한다. 생년월일 형식이 잘못되면 null.
 */
export function toStudentWriteInput(studentInput: StudentInput): StudentWriteInput | null {
  const birthDate = parseKstBirthDate(studentInput.birth_date);

  if (!birthDate) {
    return null;
  }

  const hasGuardianContact = Boolean(
    studentInput.guardian_name && studentInput.guardian_relationship && studentInput.guardian_phone
  );

  return {
    name: studentInput.name,
    gender: studentInput.gender,
    birthDate,
    address: studentInput.address,
    phone: studentInput.phone || null,
    note: studentInput.note || null,
    isNewFriend: studentInput.is_new_friend,
    firstVisitDate: studentInput.first_visit_date ? parseKstBirthDate(studentInput.first_visit_date) : null,
    guardianContact: hasGuardianContact
      ? {
          name: studentInput.guardian_name!,
          relationship: studentInput.guardian_relationship!,
          phone: studentInput.guardian_phone!,
        }
      : null,
    classId: studentInput.class_id || null,
    schoolYear: getSchoolYearInKst(),
  };
}
