import type {
  AdmissionsKpi,
  AdmissionsTrendPoint,
  DepartmentIntakeRow,
  DepartmentPlacementRow,
  PlacementsKpi,
  PresidentAlert,
  TopRecruiter,
} from './types';

/** High-priority executive alerts for the President Action Center */
export const PRESIDENT_ALERTS: PresidentAlert[] = [
  {
    id: 'alert-1',
    source: 'sample',
    title: 'Grievance SLA Breach in Hostels',
    description:
      '3 unresolved hostel grievances exceeded 72-hour SLA. Warden escalation pending VC review.',
    severity: 'critical',
    category: 'Grievance',
    timestamp: '12 min ago',
    status: 'Live',
    actionLabel: 'View Report',
    actionHref: '/president/issues',
  },
  {
    id: 'alert-2',
    source: 'sample',
    title: 'Computer Science Budget 80% Utilized',
    description:
      'CSE department has consumed ₹1.25 Cr of ₹1.56 Cr allocated budget with 4 months remaining in FY.',
    severity: 'warning',
    category: 'Finance',
    timestamp: '45 min ago',
    status: 'Pending',
    actionLabel: 'Review Budget',
    actionHref: '/president/finance-budget',
  },
  {
    id: 'alert-3',
    source: 'sample',
    title: 'AICTE Compliance Documentation Due',
    description:
      'Annual AICTE extension-of-approval documents due in 9 days. 2 annexures pending HOD signatures.',
    severity: 'warning',
    category: 'Compliance',
    timestamp: '2h ago',
    status: 'Pending',
    actionLabel: 'Open Compliance',
    actionHref: '/president/compliance',
  },
  {
    id: 'alert-4',
    source: 'sample',
    title: 'Faculty Resignation — School of Pharmacy',
    description:
      'Dr. Meena Kapoor (Associate Professor) submitted resignation. Replacement recruitment requires VC approval.',
    severity: 'info',
    category: 'HR',
    timestamp: '5h ago',
    status: 'Escalated',
    actionLabel: 'Review Appointments',
    actionHref: '/president/hr-approvals',
  },
  {
    id: 'alert-5',
    source: 'sample',
    title: 'Fee Collection Below Target — MBA Programme',
    description:
      'MBA fee collection at 62% against 80% quarterly target. ₹42 L outstanding from 118 students.',
    severity: 'critical',
    category: 'Finance',
    timestamp: 'Today',
    status: 'Live',
    actionLabel: 'View Finance',
    actionHref: '/president/finance',
  },
];

export const ADMISSIONS_KPI: AdmissionsKpi = {
  totalApplications: 18_420,
  seatsFilled: 4_128,
  targetCapacity: 4_800,
  feeCollected: 287_500_000,
};

export const ADMISSIONS_TREND: AdmissionsTrendPoint[] = [
  { month: 'Apr', lastYear: 820, thisYear: 940 },
  { month: 'May', lastYear: 1_240, thisYear: 1_380 },
  { month: 'Jun', lastYear: 1_860, thisYear: 2_105 },
  { month: 'Jul', lastYear: 2_240, thisYear: 2_510 },
  { month: 'Aug', lastYear: 2_680, thisYear: 2_980 },
  { month: 'Sep', lastYear: 3_120, thisYear: 3_485 },
  { month: 'Oct', lastYear: 3_450, thisYear: 3_840 },
  { month: 'Nov', lastYear: 3_680, thisYear: 4_012 },
  { month: 'Dec', lastYear: 3_820, thisYear: 4_128 },
];

export const DEPARTMENT_INTAKE: DepartmentIntakeRow[] = [
  {
    department: 'Computer Science & Engineering',
    program: 'B.Tech CSE',
    sanctionedIntake: 360,
    currentlyFilled: 342,
    vacant: 18,
    fillPercent: 95,
    status: 'healthy',
  },
  {
    department: 'Electronics & Communication',
    program: 'B.Tech ECE',
    sanctionedIntake: 240,
    currentlyFilled: 218,
    vacant: 22,
    fillPercent: 91,
    status: 'healthy',
  },
  {
    department: 'Mechanical Engineering',
    program: 'B.Tech ME',
    sanctionedIntake: 180,
    currentlyFilled: 156,
    vacant: 24,
    fillPercent: 87,
    status: 'healthy',
  },
  {
    department: 'Civil Engineering',
    program: 'B.Tech CE',
    sanctionedIntake: 120,
    currentlyFilled: 98,
    vacant: 22,
    fillPercent: 82,
    status: 'warning',
  },
  {
    department: 'School of Pharmacy',
    program: 'B.Pharm',
    sanctionedIntake: 100,
    currentlyFilled: 94,
    vacant: 6,
    fillPercent: 94,
    status: 'healthy',
  },
  {
    department: 'School of Management',
    program: 'MBA',
    sanctionedIntake: 180,
    currentlyFilled: 142,
    vacant: 38,
    fillPercent: 79,
    status: 'warning',
  },
  {
    department: 'Applied Sciences',
    program: 'B.Sc (Hons)',
    sanctionedIntake: 120,
    currentlyFilled: 108,
    vacant: 12,
    fillPercent: 90,
    status: 'healthy',
  },
  {
    department: 'Electrical Engineering',
    program: 'B.Tech EE',
    sanctionedIntake: 120,
    currentlyFilled: 72,
    vacant: 48,
    fillPercent: 60,
    status: 'warning',
  },
  {
    department: 'Law',
    program: 'BA LLB',
    sanctionedIntake: 60,
    currentlyFilled: 28,
    vacant: 32,
    fillPercent: 47,
    status: 'critical',
  },
  {
    department: 'Physiotherapy',
    program: 'BPT',
    sanctionedIntake: 40,
    currentlyFilled: 38,
    vacant: 2,
    fillPercent: 95,
    status: 'healthy',
  },
];

export const PLACEMENTS_KPI: PlacementsKpi = {
  overallPlacementPct: 78.4,
  highestPackageLpa: 42,
  averagePackageLpa: 6.8,
  totalOffers: 1_842,
  eligibleStudents: 2_350,
};

export const DEPARTMENT_PLACEMENTS: DepartmentPlacementRow[] = [
  { department: 'Computer Science & Engineering', placementPct: 92, placed: 312, eligible: 339 },
  { department: 'Electronics & Communication', placementPct: 84, placed: 182, eligible: 217 },
  { department: 'Mechanical Engineering', placementPct: 71, placed: 108, eligible: 152 },
  { department: 'School of Management (MBA)', placementPct: 88, placed: 124, eligible: 141 },
  { department: 'School of Pharmacy', placementPct: 76, placed: 68, eligible: 89 },
  { department: 'Civil Engineering', placementPct: 58, placed: 52, eligible: 90 },
  { department: 'Electrical Engineering', placementPct: 65, placed: 44, eligible: 68 },
  { department: 'Applied Sciences', placementPct: 54, placed: 38, eligible: 70 },
];

export const TOP_RECRUITERS: TopRecruiter[] = [
  { company: 'TCS', hires: 186, avgPackageLpa: 4.2, tier: 'Tier-1' },
  { company: 'Infosys', hires: 142, avgPackageLpa: 4.5, tier: 'Tier-1' },
  { company: 'Wipro', hires: 118, avgPackageLpa: 4.1, tier: 'Tier-1' },
  { company: 'Cognizant', hires: 96, avgPackageLpa: 4.8, tier: 'Tier-1' },
  { company: 'HCL Technologies', hires: 84, avgPackageLpa: 4.3, tier: 'Tier-1' },
  { company: 'Capgemini', hires: 72, avgPackageLpa: 4.6, tier: 'Tier-2' },
  { company: 'Deloitte', hires: 28, avgPackageLpa: 8.5, tier: 'Tier-1' },
  { company: 'Amazon', hires: 18, avgPackageLpa: 18.2, tier: 'Tier-1' },
  { company: 'L&T Construction', hires: 45, avgPackageLpa: 5.2, tier: 'Tier-2' },
  { company: 'Sun Pharma', hires: 32, avgPackageLpa: 5.8, tier: 'Tier-2' },
  { company: "BYJU'S (EdTech)", hires: 24, avgPackageLpa: 6.1, tier: 'Tier-2' },
  { company: 'Accenture', hires: 64, avgPackageLpa: 5.4, tier: 'Tier-1' },
];
