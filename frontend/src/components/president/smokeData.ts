/** Shared smoke payloads for President portal pages used in local/demo testing. */

export type ComplianceSmokeData = {
  defaulting_units: Array<{
    assignment_id: string;
    task: string;
    assigned_to: string;
    department: string;
    due_date: string;
  }>;
  overdue_count: number;
  pending_count: number;
  on_track_departments: number;
};

export type IssuesDashboardSmoke = {
  kpis: {
    open_tickets: number;
    sla_breaches: number;
    avg_resolution_hours: number;
  };
  department_heatmap: Array<{ department: string; open_count: number }>;
  escalation_inbox: Array<{
    ticket_id: string;
    category: string;
    subject: string;
    status: string;
    created_at: string;
    sla_deadline: string;
    escalation_level: number;
    student_name: string;
    dept_name: string;
  }>;
};

export type ComplianceSummarySmoke = {
  open_grievances: number;
  resolved_grievances: number;
  sla_breaches: number;
  stale_grievances: number;
  naac_readiness_score: number;
  hostel_occupancy_pct: number;
  transport: {
    buses_on_route: number;
    capacity_utilization_pct: number;
  };
  accreditation: {
    naac_readiness_pct: number;
    pending_inspections: Array<{ body: string; window: string; status: string }>;
  };
};

const daysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

const daysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

export const COMPLIANCE_SMOKE_DATA: ComplianceSmokeData = {
  overdue_count: 4,
  pending_count: 8,
  on_track_departments: 12,
  defaulting_units: [
    {
      assignment_id: 'smoke-iqac-001',
      task: 'Monthly Faculty Workload Evidence Pack',
      assigned_to: 'Dr. Meera Sharma',
      department: 'Computer Science & Engineering',
      due_date: daysAgo(3),
    },
    {
      assignment_id: 'smoke-iqac-002',
      task: 'Student Attendance Defaulter Report',
      assigned_to: 'Prof. Rajesh Verma',
      department: 'Electronics & Communication',
      due_date: daysAgo(1),
    },
    {
      assignment_id: 'smoke-iqac-003',
      task: 'Research Publication Metrics Upload',
      assigned_to: 'Dr. Anita Kapoor',
      department: 'School of Management (MBA)',
      due_date: daysFromNow(2),
    },
    {
      assignment_id: 'smoke-iqac-004',
      task: 'Laboratory Safety & Calibration Log',
      assigned_to: 'Dr. Suresh Patel',
      department: 'Mechanical Engineering',
      due_date: daysAgo(5),
    },
    {
      assignment_id: 'smoke-iqac-005',
      task: 'NAAC Criterion 2 Teaching-Learning Evidence',
      assigned_to: 'Dr. Kavita Nair',
      department: 'Applied Sciences',
      due_date: daysFromNow(5),
    },
    {
      assignment_id: 'smoke-iqac-006',
      task: 'Internship / Placement Outcome Sheet',
      assigned_to: 'Prof. Amit Joshi',
      department: 'Civil Engineering',
      due_date: daysAgo(2),
    },
    {
      assignment_id: 'smoke-iqac-007',
      task: 'Mentor-Mentee Interaction Log',
      assigned_to: 'Dr. Priya Menon',
      department: 'Electrical Engineering',
      due_date: daysFromNow(1),
    },
    {
      assignment_id: 'smoke-iqac-008',
      task: 'Pharmacy Council Compliance Checklist',
      assigned_to: 'Dr. Neha Gupta',
      department: 'School of Pharmacy',
      due_date: daysAgo(7),
    },
  ],
};

export const ISSUES_DASHBOARD_SMOKE_DATA: IssuesDashboardSmoke = {
  kpis: {
    open_tickets: 47,
    sla_breaches: 9,
    avg_resolution_hours: 18.5,
  },
  department_heatmap: [
    { department: 'Academics Department', open_count: 14 },
    { department: 'Hostel Department', open_count: 11 },
    { department: 'Finance Department', open_count: 8 },
    { department: 'IT Department', open_count: 7 },
    { department: 'General Operations', open_count: 5 },
    { department: 'Transport & Facilities', open_count: 2 },
  ],
  escalation_inbox: [
    {
      ticket_id: 'smoke-ticket-101',
      category: 'ACADEMICS',
      subject: 'Internal marks discrepancy — Mid-term CAT-2',
      status: 'OPEN',
      created_at: daysAgo(12),
      sla_deadline: daysAgo(5),
      escalation_level: 1,
      student_name: 'Aarav Mehta',
      dept_name: 'Computer Science & Engineering',
    },
    {
      ticket_id: 'smoke-ticket-102',
      category: 'HOSTEL',
      subject: 'Water shortage in Block C — unresolved for 9 days',
      status: 'OPEN',
      created_at: daysAgo(9),
      sla_deadline: daysAgo(2),
      escalation_level: 2,
      student_name: 'Ishita Rao',
      dept_name: 'Electronics & Communication',
    },
    {
      ticket_id: 'smoke-ticket-103',
      category: 'FINANCE',
      subject: 'Fee waiver request pending controller review',
      status: 'IN_PROGRESS',
      created_at: daysAgo(15),
      sla_deadline: daysAgo(8),
      escalation_level: 1,
      student_name: 'Rohan Singh',
      dept_name: 'Mechanical Engineering',
    },
    {
      ticket_id: 'smoke-ticket-104',
      category: 'IT',
      subject: 'LMS access blocked after password reset',
      status: 'OPEN',
      created_at: daysAgo(6),
      sla_deadline: daysAgo(1),
      escalation_level: 1,
      student_name: 'Sneha Patel',
      dept_name: 'School of Management (MBA)',
    },
    {
      ticket_id: 'smoke-ticket-105',
      category: 'ACADEMICS',
      subject: 'Provisional grade card not generated',
      status: 'OPEN',
      created_at: daysAgo(11),
      sla_deadline: daysAgo(4),
      escalation_level: 2,
      student_name: 'Kabir Khan',
      dept_name: 'Civil Engineering',
    },
  ],
};

export const COMPLIANCE_SUMMARY_SMOKE_DATA: ComplianceSummarySmoke = {
  open_grievances: 62,
  resolved_grievances: 418,
  sla_breaches: 9,
  stale_grievances: 7,
  naac_readiness_score: 78,
  hostel_occupancy_pct: 91,
  transport: {
    buses_on_route: 12,
    capacity_utilization_pct: 80,
  },
  accreditation: {
    naac_readiness_pct: 78,
    pending_inspections: [
      { body: 'NAAC Cycle-3 Peer Team', window: 'Aug 2026', status: 'Preparation' },
      { body: 'NBA CSE Programme', window: 'Oct 2026', status: 'Document Review' },
    ],
  },
};

export const FINANCE_SMOKE_DATA = {
  collected: 18_450_000,
  pending: 6_220_000,
  status_breakdown: [
    { status: 'PAID', count: 3120 },
    { status: 'PARTIALLY_PAID', count: 486 },
    { status: 'PENDING', count: 910 },
    { status: 'OVERDUE', count: 204 },
    { status: 'WAIVED', count: 38 },
  ],
};

export const FINANCE_BUDGET_SMOKE_DATA = {
  total_allocated: 42_000_000,
  total_utilized: 28_650_000,
  pending_approvals: 14,
  audit_status: 'In Progress',
  department_budgets: [
    { department: 'Computer Science & Engineering', allocated: 8_200_000, utilized: 6_100_000 },
    { department: 'Electronics & Communication', allocated: 5_400_000, utilized: 3_850_000 },
    { department: 'Mechanical Engineering', allocated: 4_800_000, utilized: 3_200_000 },
    { department: 'School of Management (MBA)', allocated: 6_100_000, utilized: 4_450_000 },
    { department: 'School of Pharmacy', allocated: 3_900_000, utilized: 2_780_000 },
    { department: 'Civil Engineering', allocated: 4_200_000, utilized: 2_960_000 },
  ],
};

export const RESEARCH_SMOKE_DATA = {
  active_projects: 28,
  patents_filed: 11,
  grants_received: 4_850_000,
  extension_programs: 16,
  projects: [
    {
      title: 'AI Tutoring for Rural Learners',
      pi: 'Dr. Meera Sharma',
      type: 'Sponsored',
      funding: '₹42 L',
    },
    {
      title: 'Green Campus Energy Audit',
      pi: 'Prof. Rajesh Verma',
      type: 'Extension',
      funding: '₹18 L',
    },
    {
      title: 'Pharma Formulation Stability Study',
      pi: 'Dr. Neha Gupta',
      type: 'Industry',
      funding: '₹65 L',
    },
  ],
};

export const EXECUTIVE_ORDERS_SMOKE_DATA = {
  active_suspensions: 2,
  pending_ratifications: 3,
  emergency_orders_ytd: 5,
  orders: [
    {
      id: 'EO-2026-014',
      date: '2026-06-12',
      subject: 'Temporary suspension — academic misconduct inquiry',
      type: 'Disciplinary',
    },
    {
      id: 'EO-2026-018',
      date: '2026-07-02',
      subject: 'Emergency hostel water contingency activation',
      type: 'Emergency',
    },
    {
      id: 'EO-2026-021',
      date: '2026-07-10',
      subject: 'Ratification of off-campus event security protocol',
      type: 'Ratification',
    },
  ],
};

export const CONVOCATION_SMOKE_DATA = {
  eligible_graduates: 1842,
  medals_approved: 46,
  pending_verifications: 23,
  graduates: [
    {
      student_name: 'Aarav Mehta',
      program: 'B.Tech CSE',
      honors: 'Gold Medal — Academic Excellence',
    },
    {
      student_name: 'Ishita Rao',
      program: 'MBA',
      honors: 'Silver Medal — Leadership',
    },
    {
      student_name: 'Kabir Khan',
      program: 'B.Pharm',
      honors: '—',
    },
  ],
};

export const HR_ANALYTICS_SMOKE_DATA = {
  faculty_retention_rate: 94,
  faculty_to_student_ratio: 18.2,
  total_payroll_expense: 3_850_000,
};

