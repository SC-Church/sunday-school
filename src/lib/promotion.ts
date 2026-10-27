// 학년 진급 시 이전 학년도 반 → 새 학년도 반 매핑을 자동 제안하는 순수 로직.

export type PromotionClassOption = {
  id: string;
  departmentId: string;
  name: string;
  sortOrder: number;
};

export type PromotionDepartmentOption = {
  id: string;
  sortOrder: number;
};

/**
 * 반 이름에 든 첫 번째 숫자를 반환한다(예: "초등 3학년" → 3). 없으면 null.
 */
export function extractGradeNumber(className: string): number | null {
  const matched = /\d+/.exec(className);
  return matched ? Number(matched[0]) : null;
}

/**
 * 이전 학년도 반 하나에 대해 새 학년도 반을 제안한다.
 * 1) 같은 부서에서 이름의 숫자가 +1인 반 → 2) 숫자가 없거나 +1 반이 없으면 같은 부서의 같은 이름 반
 * → 3) 그래도 없으면(부서 마지막 학년) 다음 순서 부서의 첫 반 → 4) 없으면 null(졸업/미배정).
 */
export function suggestTargetClass(
  sourceClass: PromotionClassOption,
  targetClasses: ReadonlyArray<PromotionClassOption>,
  departments: ReadonlyArray<PromotionDepartmentOption>
): PromotionClassOption | null {
  const sameDepartmentTargets = targetClasses
    .filter((target) => target.departmentId === sourceClass.departmentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const gradeNumber = extractGradeNumber(sourceClass.name);

  if (gradeNumber !== null) {
    const nextGradeTarget = sameDepartmentTargets.find((target) => extractGradeNumber(target.name) === gradeNumber + 1);

    if (nextGradeTarget) {
      return nextGradeTarget;
    }

    const hasHigherGradeInDepartment = sameDepartmentTargets.some((target) => {
      const targetGrade = extractGradeNumber(target.name);
      return targetGrade !== null && targetGrade > gradeNumber;
    });

    if (!hasHigherGradeInDepartment) {
      return findFirstClassOfNextDepartment(sourceClass.departmentId, targetClasses, departments);
    }
  }

  return sameDepartmentTargets.find((target) => target.name === sourceClass.name) ?? null;
}

/**
 * 부서 순서상 다음 부서(활성)의 첫 반을 찾는다. 없으면 null.
 */
function findFirstClassOfNextDepartment(
  departmentId: string,
  targetClasses: ReadonlyArray<PromotionClassOption>,
  departments: ReadonlyArray<PromotionDepartmentOption>
): PromotionClassOption | null {
  const orderedDepartments = [...departments].sort((a, b) => a.sortOrder - b.sortOrder);
  const currentIndex = orderedDepartments.findIndex((department) => department.id === departmentId);

  for (let index = currentIndex + 1; index < orderedDepartments.length; index += 1) {
    const [firstClass] = targetClasses
      .filter((target) => target.departmentId === orderedDepartments[index].id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (firstClass) {
      return firstClass;
    }
  }

  return null;
}
