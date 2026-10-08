export type CampusLookup = {
  campus_id: number;
  campus_name: string;
  campus_code?: string | null;
};

export type SchoolLookup = {
  school_id: number;
  school_name: string;
  school_code?: string | null;
  campus_id: number;
  campus_name?: string | null;
};

export type DepartmentLookups = {
  campuses: CampusLookup[];
  schools: SchoolLookup[];
};

export type DepartmentListRow = {
  dept_id: number;
  dept_name: string;
  description?: string | null;
  school_id?: number | null;
  school_name?: string | null;
  campus_id?: number | null;
  campus_name?: string | null;
  hod_user_id?: string | null;
  hod_name?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
  program_count?: number;
  faculty_count?: number;
  student_count?: number;
};

export type HodCandidate = {
  user_id: string;
  name: string;
  email?: string | null;
  role_name?: string | null;
  dept_name?: string | null;
};
