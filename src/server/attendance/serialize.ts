import type { AttendanceInteractiveData } from './service';

/**
 * 출석 관리 화면 데이터를 JSON 직렬화 형태(Date → ISO 문자열)로 만든다. 페이지 초기 데이터와 API 응답이 같은 모양이다.
 */
export function serializeInteractiveData(data: AttendanceInteractiveData) {
  return {
    scope: data.scope,
    schoolYear: data.schoolYear,
    classGroups: data.classGroups,
    unassignedCount: data.unassignedCount,
    studentsForTable: data.studentsForTable.map((student) => ({
      ...student,
      birthDate: student.birthDate.toISOString(),
    })),
    newFriends: data.newFriends.map((newFriend) => ({
      ...newFriend,
      firstVisitDate: newFriend.firstVisitDate ? newFriend.firstVisitDate.toISOString() : null,
    })),
    talentLogs: data.talentLogs.map((log) => ({
      ...log,
      transactedAt: log.transactedAt.toISOString(),
    })),
  };
}
