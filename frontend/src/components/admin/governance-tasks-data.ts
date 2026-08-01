export type GovernanceStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Returned'
  | 'In Review'
  | 'Scheduled';

export type GovernancePriority = 'Critical' | 'High' | 'Medium' | 'Low';

export type GovernanceCategory =
  | 'Policy Approval'
  | 'Circular'
  | 'Meeting'
  | 'Academic Council'
  | 'Executive Council';

export type GovernanceTask = {
  id: string;
  title: string;
  category: GovernanceCategory;
  assignedBy: string;
  dueDate: string;
  dueSort: string; // ISO date for sorting
  priority: GovernancePriority;
  status: GovernanceStatus;
  remarks?: string;
  assignee?: string;
  department?: string;
};

export type GovernanceKpi = {
  key: string;
  label: string;
  count: number;
  tone: 'red' | 'amber' | 'green' | 'blue' | 'purple' | 'navy';
  statusLabel: string;
  icon: 'pending' | 'policy' | 'circular' | 'meeting' | 'academic' | 'executive';
};

export const GOVERNANCE_KPIS: GovernanceKpi[] = [
  {
    key: 'pending',
    label: 'Pending Approvals',
    count: 23,
    tone: 'red',
    statusLabel: 'High Priority',
    icon: 'pending',
  },
  {
    key: 'policy',
    label: 'Policy Approvals',
    count: 8,
    tone: 'amber',
    statusLabel: 'Awaiting Review',
    icon: 'policy',
  },
  {
    key: 'circular',
    label: 'Circular Approvals',
    count: 5,
    tone: 'blue',
    statusLabel: 'In Circulation',
    icon: 'circular',
  },
  {
    key: 'meetings',
    label: 'Committee Meetings',
    count: 3,
    tone: 'green',
    statusLabel: 'Scheduled Today',
    icon: 'meeting',
  },
  {
    key: 'academic',
    label: 'Academic Council Actions',
    count: 6,
    tone: 'purple',
    statusLabel: 'Agenda Ready',
    icon: 'academic',
  },
  {
    key: 'executive',
    label: 'Executive Council Actions',
    count: 4,
    tone: 'navy',
    statusLabel: 'Board Queue',
    icon: 'executive',
  },
];

export const INITIAL_GOVERNANCE_TASKS: GovernanceTask[] = [
  {
    id: 'GV-1001',
    title: 'Approve New Academic Policy',
    category: 'Policy Approval',
    assignedBy: 'Vice Chancellor',
    dueDate: 'Today',
    dueSort: '2026-07-28',
    priority: 'High',
    status: 'Pending',
  },
  {
    id: 'GV-1002',
    title: 'Review Examination Circular',
    category: 'Circular',
    assignedBy: 'Exam Cell',
    dueDate: 'Tomorrow',
    dueSort: '2026-07-29',
    priority: 'Medium',
    status: 'In Review',
  },
  {
    id: 'GV-1003',
    title: 'Academic Council Meeting',
    category: 'Meeting',
    assignedBy: 'Chairman Office',
    dueDate: '25 July',
    dueSort: '2026-07-25',
    priority: 'High',
    status: 'Scheduled',
  },
  {
    id: 'GV-1004',
    title: 'Executive Council Resolution',
    category: 'Executive Council',
    assignedBy: 'Registrar Office',
    dueDate: '26 July',
    dueSort: '2026-07-26',
    priority: 'Critical',
    status: 'Pending',
  },
  {
    id: 'GV-1005',
    title: 'Hostel Fee Waiver Policy',
    category: 'Policy Approval',
    assignedBy: 'Dean Student Welfare',
    dueDate: '28 July',
    dueSort: '2026-07-28',
    priority: 'Medium',
    status: 'Returned',
  },
  {
    id: 'GV-1006',
    title: 'Research Grants Circular',
    category: 'Circular',
    assignedBy: 'IQAC',
    dueDate: '30 July',
    dueSort: '2026-07-30',
    priority: 'Low',
    status: 'Approved',
  },
  {
    id: 'GV-1007',
    title: 'Academic Council Curriculum Revision',
    category: 'Academic Council',
    assignedBy: 'Dean Academics',
    dueDate: '01 Aug',
    dueSort: '2026-08-01',
    priority: 'High',
    status: 'In Review',
  },
  {
    id: 'GV-1008',
    title: 'Executive Council Capex Note',
    category: 'Executive Council',
    assignedBy: 'Finance Office',
    dueDate: '02 Aug',
    dueSort: '2026-08-02',
    priority: 'Critical',
    status: 'Pending',
  },
];

export const GOVERNANCE_TIMELINE = [
  { title: 'Academic Council Meeting', when: 'Tomorrow 10:00 AM', tone: 'purple' as const },
  { title: 'Executive Council Meeting', when: 'Friday', tone: 'navy' as const },
  { title: 'Policy Deadline', when: 'Today 5:00 PM', tone: 'amber' as const },
  { title: 'Circular Release', when: 'Next Monday', tone: 'blue' as const },
];

export const GOVERNANCE_NOTIFICATIONS = [
  'Vice Chancellor approved Policy 12',
  'New Executive Council meeting added',
  'Circular released for examination schedule',
  'Committee agenda updated for Academic Council',
  'Registrar returned Hostel Fee Waiver for revision',
];

export const GOVERNANCE_COMPLETED_TREND = [
  { day: 'Mon', completed: 4 },
  { day: 'Tue', completed: 6 },
  { day: 'Wed', completed: 3 },
  { day: 'Thu', completed: 7 },
  { day: 'Fri', completed: 5 },
  { day: 'Sat', completed: 2 },
  { day: 'Sun', completed: 1 },
];

export const GOVERNANCE_OFFICERS = [
  { name: 'Dr. Meera Joshi', department: 'Academics' },
  { name: 'Amit Verma', department: 'Examination Cell' },
  { name: 'Sneha Kapoor', department: 'Registrar Office' },
  { name: 'Prof. Rakesh Iyer', department: 'IQAC' },
];
