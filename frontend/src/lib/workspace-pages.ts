'use client';

import type { WorkspacePageConfig } from '@/components/workspaces/WorkspaceScaffold';

const money = (value: unknown) => `₹${Number(value ?? 0).toLocaleString('en-IN')}`;
const count = (data: unknown, key: string) => Number((data as Record<string, unknown> | null)?.[key] ?? 0);

export const hodPages = {
  dashboard: {
    title: 'Department Snapshot',
    subtitle: 'Faculty presence, student strength, and departmental attendance health.',
    endpoint: '/api/academics/hod/dashboard',
    summary: (data) => [
      { label: 'Faculty Present Today', value: count(data, 'faculty_present_today') },
      { label: 'Total Students', value: count(data, 'total_students') },
      { label: 'Average Attendance', value: `${count(data, 'average_department_attendance')}%` },
      { label: 'Pending Approvals', value: count(data, 'pending_leave_approvals') + count(data, 'pending_gate_pass_approvals') },
      { label: 'Profile Corrections', value: count(data, 'pending_profile_corrections') },
    ],
  },
  facultyRoster: {
    title: 'Faculty Roster & Course Allocation',
    subtitle: 'Department faculty list with current subject allocation from academic timetables.',
    endpoint: '/api/academics/hod/faculty-roster',
    columns: [
      { key: 'name', label: 'Faculty' },
      { key: 'email', label: 'Email' },
      { key: 'department', label: 'Department' },
      { key: 'role', label: 'Role' },
      { key: 'courses', label: 'Allocated Courses' },
    ],
  },
  studentMonitor: {
    title: 'Student Monitor',
    subtitle: 'Department students with low-attendance risk visibility before exam season.',
    endpoint: '/api/academics/hod/student-monitor?lowAttendance=true',
    columns: [
      { key: 'name', label: 'Student' },
      { key: 'email', label: 'Email' },
      { key: 'department', label: 'Department' },
      { key: 'average_attendance', label: 'Avg Attendance %' },
      { key: 'course_count', label: 'Courses' },
    ],
  },
  leaveApprovals: {
    title: 'Faculty Leave Approvals',
    subtitle: 'Dedicated CL/SL/EL inbox for HOD review.',
    endpoint: '/api/academics/hod/approvals/leaves',
    columns: [
      { key: 'staff.name', label: 'Faculty' },
      { key: 'leave_type', label: 'Type' },
      { key: 'start_date', label: 'From' },
      { key: 'end_date', label: 'To' },
      { key: 'reason', label: 'Reason' },
    ],
  },
  gatePassApprovals: {
    title: 'Faculty Gate Pass Approvals',
    subtitle: 'Mid-duty exit pass inbox, separate from leave requests.',
    endpoint: '/api/academics/hod/approvals/gate-passes',
    columns: [
      { key: 'staff.name', label: 'Faculty' },
      { key: 'out_time', label: 'Out Time' },
      { key: 'expected_in_time', label: 'Expected In' },
      { key: 'reason', label: 'Reason' },
    ],
  },
} satisfies Record<string, WorkspacePageConfig>;

export const financePages = {
  dashboard: {
    title: 'Finance Dashboard',
    subtitle: "Today's collections, university outstanding dues, and recent successful payments.",
    endpoint: '/finance/dashboard',
    dataKey: 'recent_transactions',
    summary: (data) => [
      { label: "Today's Collection", value: money((data as Record<string, unknown> | null)?.todays_collection) },
      { label: 'Outstanding Dues', value: money((data as Record<string, unknown> | null)?.total_outstanding) },
      { label: 'Transactions Today', value: count(data, 'transaction_count_today') },
    ],
    columns: [
      { key: 'transaction_id', label: 'Transaction' },
      { key: 'student_user_id', label: 'Student ID' },
      { key: 'amount', label: 'Amount' },
      { key: 'gateway', label: 'Gateway' },
    ],
  },
  feeDemands: {
    title: 'Fee Demands',
    subtitle: 'Bulk-generate semester invoices without cluttering the dashboard.',
    endpoint: '/finance/demands',
    action: 'bulk-demands',
    columns: [
      { key: 'student_user_id', label: 'Student ID' },
      { key: 'fee_head', label: 'Fee Head' },
      { key: 'semester', label: 'Semester' },
      { key: 'total_amount', label: 'Total' },
      { key: 'due_date', label: 'Due Date' },
    ],
  },
  transactions: {
    title: 'Transactions Ledger',
    subtitle: 'Central ledger for successful gateway and manual payments.',
    endpoint: '/finance/transactions',
    columns: [
      { key: 'transaction_id', label: 'Transaction' },
      { key: 'student_user_id', label: 'Student ID' },
      { key: 'amount', label: 'Amount' },
      { key: 'gateway', label: 'Gateway' },
      { key: 'created_at', label: 'Paid At' },
    ],
  },
  defaulters: {
    title: 'Defaulters',
    subtitle: 'Unpaid students with admit-card lock controls for exam readiness.',
    endpoint: '/finance/defaulters',
    action: 'lock-admit-cards',
    columns: [
      { key: 'student.name', label: 'Student' },
      { key: 'student.official_email', label: 'Email' },
      { key: 'outstanding_amount', label: 'Outstanding' },
      { key: 'due_date', label: 'Due Date' },
      { key: 'admit_card_locked', label: 'Admit Card Locked' },
    ],
  },
  scholarships: {
    title: 'Scholarships & Waivers',
    subtitle: 'Apply targeted 50% discounts to active student fee demands.',
    endpoint: '/finance/demands',
    action: 'scholarship',
    columns: [
      { key: 'student_user_id', label: 'Student ID' },
      { key: 'fee_head', label: 'Fee Head' },
      { key: 'total_amount', label: 'Adjusted Total' },
      { key: 'status', label: 'Demand Status' },
    ],
  },
} satisfies Record<string, WorkspacePageConfig>;

export const iqacPages = {
  dashboard: {
    title: 'IQAC Compliance Heat Map',
    subtitle: 'Departments at risk of missing monthly accreditation submissions.',
    endpoint: '/iqac/dashboard',
    dataKey: 'heatmap',
    chart: (data) =>
      (((data as { heatmap?: Array<{ department: string; pending_reports: number }> } | null)?.heatmap ?? []).map((row) => ({
        label: row.department,
        value: row.pending_reports * 20,
        tone: row.pending_reports > 2 ? 'red' : row.pending_reports > 0 ? 'gold' : 'green',
      }))),
    columns: [
      { key: 'department', label: 'Department' },
      { key: 'pending_reports', label: 'Pending Reports' },
      { key: 'risk', label: 'Risk' },
    ],
  },
  taskMaster: {
    title: 'Task Master',
    subtitle: 'Create and schedule recurring monthly Falcon Core tasks.',
    endpoint: '/iqac/task-master',
    action: 'create-task',
    columns: [
      { key: 'task_name', label: 'Task' },
      { key: 'role.role_name', label: 'Role' },
      { key: 'month', label: 'Month' },
      { key: 'is_recurring', label: 'Recurring' },
    ],
  },
  documentVault: {
    title: 'AI-Audited Document Vault',
    subtitle: "Manual review inbox for Gemini's PDF extraction and validation results.",
    endpoint: '/iqac/document-vault',
    columns: [
      { key: 'assignment.task.task_name', label: 'Task' },
      { key: 'assignment.assigned_user.name', label: 'Submitted By' },
      { key: 'file_name', label: 'File' },
      { key: 'ai_status', label: 'AI Status' },
      { key: 'uploaded_at', label: 'Uploaded' },
    ],
  },
  studentAchievements: {
    title: 'Student Achievements',
    subtitle: 'Verified extracurricular certificates for NAAC points and accreditation reporting.',
    endpoint: '/iqac/student-achievements',
    columns: [
      { key: 'student.name', label: 'Student' },
      { key: 'title', label: 'Achievement' },
      { key: 'issuer', label: 'Issuer' },
      { key: 'verification_status', label: 'Verification' },
      { key: 'points_awarded', label: 'Points' },
    ],
  },
  exportCenter: {
    title: 'Export Center',
    subtitle: 'Standardized accreditation exports for government reporting.',
    endpoint: '/iqac/export-center',
    dataKey: 'exports',
    columns: [
      { key: 'label', label: 'Report' },
      { key: 'format', label: 'Format' },
      { key: 'status', label: 'Status' },
    ],
  },
} satisfies Record<string, WorkspacePageConfig>;

export const presidentPages = {
  executiveSummary: {
    title: 'Executive Summary',
    subtitle: "The President's bird's-eye view of revenue and university headcount.",
    endpoint: '/api/president/executive-summary',
    summary: (data) => {
      const headcount = (data as { headcount?: { students?: number; staff?: number; total?: number } } | null)?.headcount;
      return [
        { label: 'Total Revenue', value: money((data as Record<string, unknown> | null)?.total_university_revenue) },
        { label: 'Collected', value: money((data as Record<string, unknown> | null)?.total_collected) },
        { label: 'Students', value: headcount?.students ?? 0 },
        { label: 'Staff', value: headcount?.staff ?? 0 },
      ];
    },
  },
  academics: {
    title: 'Academic Analytics',
    subtitle: 'Pass/fail ratios and attendance trends by school and department.',
    endpoint: '/api/president/academics',
    dataKey: 'schools',
    chart: (data) =>
      (((data as { schools?: Array<{ department: string; average_attendance: number }> } | null)?.schools ?? []).map((row) => ({
        label: row.department,
        value: row.average_attendance,
        tone: 'navy',
      }))),
    columns: [
      { key: 'department', label: 'School / Department' },
      { key: 'pass_count', label: 'Pass' },
      { key: 'fail_count', label: 'Fail' },
      { key: 'average_attendance', label: 'Avg Attendance' },
    ],
  },
  finance: {
    title: 'Revenue Analytics',
    subtitle: 'Collected versus pending revenue with fee status breakdown.',
    endpoint: '/api/president/finance',
    dataKey: 'status_breakdown',
    summary: (data) => [
      { label: 'Collected', value: money((data as Record<string, unknown> | null)?.collected) },
      { label: 'Pending', value: money((data as Record<string, unknown> | null)?.pending) },
    ],
    chart: (data) => [
      { label: 'Collected', value: Number((data as Record<string, unknown> | null)?.collected ?? 0) / 1000, tone: 'green' },
      { label: 'Pending', value: Number((data as Record<string, unknown> | null)?.pending ?? 0) / 1000, tone: 'gold' },
    ],
    columns: [
      { key: 'status', label: 'Status' },
      { key: 'count', label: 'Demand Count' },
    ],
  },
  compliance: {
    title: 'Compliance View',
    subtitle: 'IQAC defaulting units visible to leadership without operational edit access.',
    endpoint: '/api/president/compliance',
    dataKey: 'defaulting_units',
    columns: [
      { key: 'task', label: 'Task' },
      { key: 'assigned_to', label: 'Owner' },
      { key: 'department', label: 'Department' },
      { key: 'due_date', label: 'Due Date' },
    ],
  },
  hrAnalytics: {
    title: 'HR Analytics',
    subtitle: 'Faculty retention, faculty-to-student ratio, and monthly payroll exposure.',
    endpoint: '/api/president/hr-analytics',
    summary: (data) => [
      { label: 'Retention Rate', value: `${count(data, 'faculty_retention_rate')}%` },
      { label: 'Faculty:Student Ratio', value: count(data, 'faculty_to_student_ratio') },
      { label: 'Payroll Expense', value: money((data as Record<string, unknown> | null)?.total_payroll_expense) },
    ],
  },
} satisfies Record<string, WorkspacePageConfig>;
