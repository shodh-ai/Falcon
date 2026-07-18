import type {
  ExecutiveApprovalRow,
  FacultyShortageRow,
  HrKpi,
  PayrollBurnPoint,
} from './types';

/** Format INR amounts for executive KPIs and tables */
export function formatInrCompact(value: number): string {
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(1)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

export function formatFacultyRatio(studentsPerFaculty: number): string {
  return `1:${Math.round(studentsPerFaculty)}`;
}

/** UGC norm guidance: >1:20 = warning, <1:15 = optimal */
export function facultyRatioBadge(
  studentsPerFaculty: number,
): 'warning' | 'optimal' | null {
  if (studentsPerFaculty > 20) return 'warning';
  if (studentsPerFaculty < 15) return 'optimal';
  return null;
}

export const HR_KPI: HrKpi = {
  monthlyPayroll: { amount: 15_200_000, momTrend: 1.2 },
  facultyStudentRatio: { studentsPerFaculty: 18 },
  retentionRate: 94,
  pendingActions: 12,
};

export const FACULTY_SHORTAGE_DATA: FacultyShortageRow[] = [
  { department: 'Computer Science', sanctioned: 42, filled: 34, shortage: 8 },
  { department: 'Mechanical Engg.', sanctioned: 38, filled: 31, shortage: 7 },
  { department: 'ECE', sanctioned: 36, filled: 32, shortage: 4 },
  { department: 'Civil Engg.', sanctioned: 28, filled: 22, shortage: 6 },
  { department: 'MBA', sanctioned: 24, filled: 21, shortage: 3 },
  { department: 'Pharmacy', sanctioned: 22, filled: 20, shortage: 2 },
];

export const PAYROLL_BURN_TREND: PayrollBurnPoint[] = [
  { month: 'Feb', payrollCr: 1.38 },
  { month: 'Mar', payrollCr: 1.41 },
  { month: 'Apr', payrollCr: 1.44 },
  { month: 'May', payrollCr: 1.48 },
  { month: 'Jun', payrollCr: 1.5 },
  { month: 'Jul', payrollCr: 1.52 },
];

export const EXECUTIVE_APPROVALS: ExecutiveApprovalRow[] = [
  {
    id: 'ea-1',
    name: 'Dr. Ananya Reddy',
    department: 'Computer Science & Engineering',
    actionType: 'New Hire - HOD',
    ctcInr: 28_50_000,
  },
  {
    id: 'ea-2',
    name: 'Prof. Vikram Malhotra',
    department: 'Mechanical Engineering',
    actionType: 'Tenure Ratification',
    ctcInr: 22_40_000,
  },
  {
    id: 'ea-3',
    name: 'Dr. Priya Nambiar',
    department: 'School of Management (MBA)',
    actionType: 'New Hire - Associate Professor',
    ctcInr: 18_75_000,
  },
  {
    id: 'ea-4',
    name: 'Mr. Rohan Desai',
    department: 'Central Administration',
    actionType: 'Suspension Review',
    ctcInr: 9_60_000,
  },
  {
    id: 'ea-5',
    name: 'Dr. Suresh Iyer',
    department: 'Electronics & Communication',
    actionType: 'Tenure Ratification',
    ctcInr: 21_00_000,
  },
  {
    id: 'ea-6',
    name: 'Prof. Meenakshi Gupta',
    department: 'School of Pharmacy',
    actionType: 'New Hire - Professor',
    ctcInr: 26_80_000,
  },
  {
    id: 'ea-7',
    name: 'Dr. Arjun Khanna',
    department: 'Civil Engineering',
    actionType: 'Contract Renewal - Dean',
    ctcInr: 32_00_000,
  },
  {
    id: 'ea-8',
    name: 'Ms. Kavitha Srinivasan',
    department: 'Human Resources',
    actionType: 'Suspension Review',
    ctcInr: 8_40_000,
  },
];
