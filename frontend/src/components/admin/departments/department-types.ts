export type DepartmentStatus = 'ACTIVE' | 'INACTIVE';

export type DepartmentListRow = {
  dept_id: number;
  dept_name: string;
  dept_code?: string | null;
  description?: string | null;
  school_id?: number | null;
  school_name?: string | null;
  school_code?: string | null;
  campus_id?: number | null;
  campus_name?: string | null;
  campus_code?: string | null;
  hod_user_id?: string | null;
  hod_name?: string | null;
  hod_email?: string | null;
  hod_is_active?: boolean | null;
  status: DepartmentStatus;
  program_count?: number | null;
  faculty_count?: number | null;
  student_count?: number | null;
};

export type DepartmentLookups = {
  campuses: Array<{ campus_id: number; campus_name: string; campus_code?: string | null }>;
  schools: Array<{
    school_id: number;
    school_name: string;
    school_code?: string | null;
    campus_id: number | null;
    campus_name?: string | null;
  }>;
};

export type HodCandidate = {
  user_id: string;
  name: string;
  email?: string | null;
  role_name?: string | null;
  dept_name?: string | null;
};

export type DepartmentDetail = {
  department: DepartmentListRow & {
    dean_name?: string | null;
    dean_email?: string | null;
    dean_is_active?: boolean | null;
  };
  counts: {
    programs: number;
    faculty: number;
    students: number;
    active_students: number;
    courses: number | null;
  };
  programs: Array<{
    program_id: number;
    program_name: string;
    program_code?: string | null;
    duration_years?: number | null;
    status?: string | null;
  }>;
  faculty: Array<{
    user_id: string;
    name: string;
    email?: string | null;
    is_active?: boolean | null;
    role_name?: string | null;
    designation?: string | null;
  }>;
  courses: Array<{
    course_id: string;
    course_code: string;
    course_name: string;
    credits?: number | null;
  }>;
  activity: Array<{
    audit_id?: string;
    action: string;
    resource_type: string;
    created_at: string;
    actor_name?: string | null;
  }>;
};

export function displayValue(value: string | number | null | undefined): string {
  if (value == null || value === '') return 'N/A';
  return String(value);
}

export function displayCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return 'N/A';
  return Number(value).toLocaleString();
}
