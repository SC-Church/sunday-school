import type { ClassFilterGroup, StudentInput } from '@/app/students/StudentsView';
import type { TeacherRow } from '@/app/teachers/TeachersView';
import { formatDateToKoreanYmd } from '@/utils/date';
import { getSchoolYearInKst } from '@/utils/grade';

/**
 * 게스트 모드에서 보여줄 데모 데이터.
 * 실제 학생·교사 정보가 아니며 DB를 조회하지 않는다.
 */

/**
 * 오늘(KST) 기준으로 주어진 주차의 일요일을 YYYY-MM-DD로 반환한다.
 * 데모 화면이 항상 최근 날짜처럼 보이도록 고정값 대신 계산한다.
 */
function getSundayYmd(weekOffset: number): string {
  const todayKstYmd = formatDateToKoreanYmd(new Date());
  const anchorDate = new Date(`${todayKstYmd}T00:00:00Z`);

  anchorDate.setUTCDate(anchorDate.getUTCDate() - anchorDate.getUTCDay() + weekOffset * 7);

  return anchorDate.toISOString().slice(0, 10);
}

const WEEKLY_PRESENT_COUNTS = [18, 21, 19, 23, 20, 24, 22, 25, 21, 26, 24, 27];

/**
 * 게스트 대시보드에 넘길 데모 데이터를 만든다.
 */
export function getGuestDashboardData() {
  const currentSundayYmd = getSundayYmd(0);
  const currentMonth = Number(currentSundayYmd.slice(5, 7));

  return {
    currentQuarter: Math.ceil(currentMonth / 3),
    shouldShowBirthdayPartyBanner: true,
    quarterlyBirthdayStudents: [
      { id: 'demo-student-1', name: '김하늘', gradeLabel: '6학년' },
      { id: 'demo-student-2', name: '이서준', gradeLabel: '4학년' },
      { id: 'demo-student-3', name: '박지우', gradeLabel: '4학년' },
      { id: 'demo-student-4', name: '최윤아', gradeLabel: '2학년' },
      { id: 'demo-student-5', name: '정도현', gradeLabel: '유아부' },
    ],
    thisMonthTeacherBirthdays: [
      { id: 'demo-teacher-1', displayName: '김선교 선생님' },
      { id: 'demo-teacher-2', displayName: '이믿음 선생님' },
    ],
    nextMonthTeacherBirthdays: [{ id: 'demo-teacher-3', displayName: '박소망 선생님' }],
    todayPresentCount: 27,
    weeklyTrend: WEEKLY_PRESENT_COUNTS.map((count, index) => ({
      label: getSundayYmd(index - (WEEKLY_PRESENT_COUNTS.length - 1)).slice(5),
      count,
    })),
    currentWeekCalendarSummary: {
      title: '사회: 박은혜 / 단상: 김도윤',
      worshipDate: currentSundayYmd,
      socialLeader: '박은혜',
      pulpitLeader: '김도윤',
      weeklySchedules: ['예배 후 교사 회의', '수요일 성경학교 준비 모임', '토요일 찬양 연습'],
    },
    nextWeekCalendarSummary: {
      title: '사회: 김도윤 / 단상: 이믿음',
      worshipDate: getSundayYmd(1),
      socialLeader: '김도윤',
      pulpitLeader: '이믿음',
      weeklySchedules: ['분기 생일잔치', '신입 교사 환영'],
    },
  };
}

/**
 * 원하는 학년으로 계산되는 생년월일을 만든다.
 * grade.ts의 계산식(학사연도 - 출생연도 - 6)을 그대로 따르므로 해가 바뀌어도 학년이 어긋나지 않는다.
 * gradeNumber 7 이상은 졸업생, 0 이하는 유아부가 된다.
 */
function getBirthDateForGrade(gradeNumber: number, monthDay: string): Date {
  const birthYear = getSchoolYearInKst() - 6 - gradeNumber;

  return new Date(`${birthYear}-${monthDay}T00:00:00+09:00`);
}

/**
 * 게스트 학생 관리 화면에 넘길 데모 학생 목록을 만든다.
 */
export function getGuestStudents(): StudentInput[] {
  return [
    {
      id: 'demo-student-1',
      name: '김하늘',
      gender: 'FEMALE',
      birthDate: getBirthDateForGrade(6, '04-12'),
      address: '서울시 광진구 중곡동',
      phone: '010-1234-5678',
      currentTalent: 42,
      guardianContact: { name: '김성실', relationship: 'FATHER', phone: '010-1234-1111' },
      classId: 'demo-class-6',
      className: '6학년',
      departmentName: '유년부',
      isNewFriend: false,
      note: null,
    },
    {
      id: 'demo-student-2',
      name: '이서준',
      gender: 'MALE',
      birthDate: getBirthDateForGrade(4, '07-03'),
      address: '서울시 광진구 능동',
      phone: null,
      currentTalent: 35,
      guardianContact: { name: '이온유', relationship: 'MOTHER', phone: '010-2345-2222' },
      classId: 'demo-class-4',
      className: '4학년',
      departmentName: '유년부',
      isNewFriend: false,
      note: '견과류 알레르기',
    },
    {
      id: 'demo-student-3',
      name: '박지우',
      gender: 'FEMALE',
      birthDate: getBirthDateForGrade(4, '11-21'),
      address: '서울시 광진구 자양동',
      phone: null,
      currentTalent: 28,
      guardianContact: { name: '박기쁨', relationship: 'MOTHER', phone: '010-3456-3333' },
      classId: 'demo-class-4',
      className: '4학년',
      departmentName: '유년부',
      isNewFriend: false,
      note: null,
    },
    {
      id: 'demo-student-4',
      name: '최윤아',
      gender: 'FEMALE',
      birthDate: getBirthDateForGrade(2, '02-08'),
      address: '서울시 광진구 구의동',
      phone: null,
      currentTalent: 19,
      guardianContact: { name: '최평안', relationship: 'GRANDMOTHER', phone: '010-4567-4444' },
      classId: 'demo-class-2',
      className: '2학년',
      departmentName: '유년부',
      isNewFriend: false,
      note: null,
    },
    {
      id: 'demo-student-5',
      name: '정도현',
      gender: 'MALE',
      birthDate: getBirthDateForGrade(1, '09-30'),
      address: '서울시 광진구 화양동',
      phone: null,
      currentTalent: 24,
      guardianContact: { name: '정사랑', relationship: 'FATHER', phone: '010-5678-5555' },
      classId: 'demo-class-1',
      className: '1학년',
      departmentName: '유년부',
      isNewFriend: false,
      note: null,
    },
    {
      id: 'demo-student-6',
      name: '한소민',
      gender: 'FEMALE',
      birthDate: getBirthDateForGrade(0, '05-17'),
      address: '서울시 광진구 군자동',
      phone: null,
      currentTalent: 12,
      guardianContact: { name: '한소망', relationship: 'MOTHER', phone: '010-6789-6666' },
      classId: 'demo-class-k',
      className: '유아반',
      departmentName: '유년부',
      isNewFriend: true,
      note: null,
    },
    {
      id: 'demo-student-7',
      name: '오지환',
      gender: 'MALE',
      birthDate: getBirthDateForGrade(7, '01-25'),
      address: '서울시 광진구 중곡동',
      phone: null,
      currentTalent: 58,
      guardianContact: { name: '오진실', relationship: 'FATHER', phone: '010-7890-7777' },
      classId: 'demo-class-m1',
      className: '중1',
      departmentName: '청소년부',
      isNewFriend: false,
      note: null,
    },
  ];
}

/**
 * 게스트 학생 관리 화면의 반 선택 칩에 쓸 데모 부서·반 목록을 만든다.
 */
export function getGuestClassGroups(): ClassFilterGroup[] {
  const students = getGuestStudents();
  const countByClassId = (classId: string) => students.filter((student) => student.classId === classId).length;

  return [
    {
      departmentId: 'demo-dept-kids',
      departmentName: '유년부',
      classes: [
        { id: 'demo-class-k', name: '유아반', studentCount: countByClassId('demo-class-k') },
        { id: 'demo-class-1', name: '1학년', studentCount: countByClassId('demo-class-1') },
        { id: 'demo-class-2', name: '2학년', studentCount: countByClassId('demo-class-2') },
        { id: 'demo-class-4', name: '4학년', studentCount: countByClassId('demo-class-4') },
        { id: 'demo-class-6', name: '6학년', studentCount: countByClassId('demo-class-6') },
      ],
    },
    {
      departmentId: 'demo-dept-youth',
      departmentName: '청소년부',
      classes: [{ id: 'demo-class-m1', name: '중1', studentCount: countByClassId('demo-class-m1') }],
    },
  ];
}

/**
 * 게스트 교사 정보 화면에 넘길 데모 교사 목록을 만든다.
 */
export function getGuestTeachers(): TeacherRow[] {
  return [
    {
      id: 'demo-teacher-1',
      email: 'demo.admin@example.com',
      name: '김선교',
      phone: '010-1111-2222',
      birthDate: new Date('1988-03-14T00:00:00+09:00'),
      grade: '유년부 6학년',
      role: 'ADMIN',
      isActive: true,
    },
    {
      id: 'demo-teacher-2',
      email: 'demo.teacher1@example.com',
      name: '이믿음',
      phone: '010-2222-3333',
      birthDate: new Date('1993-08-02T00:00:00+09:00'),
      grade: '유년부 4학년',
      role: 'TEACHER',
      isActive: true,
    },
    {
      id: 'demo-teacher-3',
      email: 'demo.teacher2@example.com',
      name: '박소망',
      phone: '010-3333-4444',
      birthDate: new Date('1996-11-27T00:00:00+09:00'),
      grade: '유년부 유아반',
      role: 'TEACHER',
      isActive: true,
    },
    {
      id: 'demo-teacher-4',
      email: 'demo.teacher3@example.com',
      name: '정은혜',
      phone: null,
      birthDate: null,
      grade: '유년부 2학년',
      role: 'TEACHER',
      isActive: false,
    },
  ];
}
