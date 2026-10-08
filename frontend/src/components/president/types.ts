export type AlertSeverity = 'critical' | 'warning' | 'info';

export type PresidentAlert = {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  category: string;
  timestamp: string;
  status: 'Live' | 'Pending' | 'Escalated';
  source?: 'live' | 'sample';
  actionLabel: string;
  actionHref: string;
};

export type AdmissionsKpi = {
  totalApplications: number;
  seatsFilled: number;
  targetCapacity: number;
  feeCollected: number;
};

export type AdmissionsTrendPoint = {
  month: string;
  lastYear: number;
  thisYear: number;
};

export type DepartmentIntakeRow = {
  department: string;
  program: string;
  sanctionedIntake: number;
  currentlyFilled: number;
  vacant: number;
  fillPercent: number;
  status: 'healthy' | 'warning' | 'critical';
};

export type PlacementsKpi = {
  overallPlacementPct: number;
  highestPackageLpa: number;
  averagePackageLpa: number;
  totalOffers: number;
  eligibleStudents: number;
};

export type DepartmentPlacementRow = {
  department: string;
  placementPct: number;
  placed: number;
  eligible: number;
};

export type TopRecruiter = {
  company: string;
  hires: number;
  avgPackageLpa: number;
  tier: 'Tier-1' | 'Tier-2' | 'Tier-3';
};

export type HrKpi = {
  monthlyPayroll: { amount: number; momTrend: number };
  facultyStudentRatio: { studentsPerFaculty: number };
  retentionRate: number;
  pendingActions: number;
};

export type FacultyShortageRow = {
  department: string;
  sanctioned: number;
  filled: number;
  shortage: number;
};

export type PayrollBurnPoint = {
  month: string;
  payrollCr: number;
};

export type ExecutiveApprovalRow = {
  id: string;
  name: string;
  department: string;
  actionType: string;
  ctcInr: number;
};
