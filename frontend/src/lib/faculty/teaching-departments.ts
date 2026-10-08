export type TeachingDepartment = {
  dept_id: number;
  dept_name: string;
  course_count: number;
  weekly_hours: number;
};

export type TeachingDepartmentsResponse = {
  is_multi_department: boolean;
  home_dept_id: number | null;
  departments: TeachingDepartment[];
};

export function withTeachingDeptId(path: string, deptId: number | null | undefined): string {
  if (deptId == null) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}deptId=${deptId}`;
}
