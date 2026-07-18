export type AcademicSchoolRow = {
  department: string;
  pass_pct: number;
  fail_pct: number;
  average_attendance: number;
};

export type AcademicsKpi = {
  avgAttendance: { value: number; trend: number };
  passRate: { value: number; trend: number };
  activeStudents: number;
  atRiskDepartments: number;
};

export const ACADEMICS_KPI: AcademicsKpi = {
  avgAttendance: { value: 79, trend: 2.1 },
  passRate: { value: 88, trend: -1.2 },
  activeStudents: 4512,
  atRiskDepartments: 2,
};

/** Realistic department-level academic analytics for executive review */
export const ACADEMICS_SCHOOLS: AcademicSchoolRow[] = [
  {
    department: 'Computer Science & Engineering',
    pass_pct: 90,
    fail_pct: 10,
    average_attendance: 88,
  },
  {
    department: 'Electronics & Communication',
    pass_pct: 92,
    fail_pct: 8,
    average_attendance: 82,
  },
  {
    department: 'Mechanical Engineering',
    pass_pct: 85,
    fail_pct: 15,
    average_attendance: 71,
  },
  {
    department: 'School of Management (MBA)',
    pass_pct: 94,
    fail_pct: 6,
    average_attendance: 90,
  },
  {
    department: 'School of Pharmacy',
    pass_pct: 88,
    fail_pct: 12,
    average_attendance: 86,
  },
  {
    department: 'Civil Engineering',
    pass_pct: 78,
    fail_pct: 22,
    average_attendance: 68,
  },
  {
    department: 'Electrical Engineering',
    pass_pct: 81,
    fail_pct: 19,
    average_attendance: 74,
  },
  {
    department: 'Applied Sciences',
    pass_pct: 87,
    fail_pct: 13,
    average_attendance: 79,
  },
];

export function attendanceBarColor(pct: number): string {
  if (pct >= 85) return 'bg-emerald-500';
  if (pct >= 75) return 'bg-amber-500';
  return 'bg-sgvu-navy';
}

export function isHealthyAttendance(pct: number): boolean {
  return pct >= 75;
}
