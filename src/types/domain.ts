// 클라이언트/서버 공용 도메인 상수. 이전에는 @prisma/client enum을 썼으나 저장소가 Google Sheets로 바뀌며 여기서 정의한다.

export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
} as const;

export const Relationship = {
  FATHER: 'FATHER',
  MOTHER: 'MOTHER',
  GRANDFATHER: 'GRANDFATHER',
  GRANDMOTHER: 'GRANDMOTHER',
  ETC: 'ETC',
} as const;

export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
} as const;

export const TalentTransactionReason = {
  ATTENDANCE: 'ATTENDANCE',
  MANUAL_ADJUST: 'MANUAL_ADJUST',
} as const;

export type Gender = (typeof Gender)[keyof typeof Gender];
export type Relationship = (typeof Relationship)[keyof typeof Relationship];
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];
export type TalentTransactionReason = (typeof TalentTransactionReason)[keyof typeof TalentTransactionReason];

export const EnrollmentStatus = {
  /** 현재 이 반에 소속 */
  ACTIVE: 'ACTIVE',
  /** 반 이동·진급 등으로 종료된 배정(이력) */
  ENDED: 'ENDED',
} as const;

export const EnrollmentReason = {
  /** 등록/수정 화면이나 조직 관리에서 직접 배정 */
  MANUAL: 'MANUAL',
  /** CSV 일괄 등록 */
  IMPORT: 'IMPORT',
  /** 학년도 중 반·부서 이동 */
  TRANSFER: 'TRANSFER',
  /** 새 학년도 진급 */
  PROMOTION: 'PROMOTION',
} as const;

export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];
export type EnrollmentReason = (typeof EnrollmentReason)[keyof typeof EnrollmentReason];
