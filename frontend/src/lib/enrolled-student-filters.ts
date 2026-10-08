export type EnrolledStudentBranch = {
  branch_key: string;
  dept_id: number | null;
  dept_name: string;
};

export function deriveEnrolledStudentBranches(
  students: Array<{
    dept_id?: number | null;
    dept_name?: string | null;
    batch?: string | null;
  }>,
): EnrolledStudentBranch[] {
  const map = new Map<string, EnrolledStudentBranch>();
  for (const student of students) {
    const label = (student.dept_name || student.batch || '').trim();
    if (!label) continue;
    const branchKey =
      student.dept_id != null ? String(student.dept_id) : `name:${label}`;
    if (!map.has(branchKey)) {
      map.set(branchKey, {
        branch_key: branchKey,
        dept_id: student.dept_id ?? null,
        dept_name: label,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.dept_name.localeCompare(b.dept_name));
}

export function mergeEnrolledStudentBranches(
  ...lists: EnrolledStudentBranch[][]
): EnrolledStudentBranch[] {
  const map = new Map<string, EnrolledStudentBranch>();
  for (const list of lists) {
    for (const item of list) {
      map.set(item.branch_key, item);
    }
  }
  return [...map.values()].sort((a, b) => a.dept_name.localeCompare(b.dept_name));
}
