import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Wallet,
  GraduationCap,
  ClipboardCheck,
  ClipboardList,
  CalendarDays,
  CalendarRange,
  ListChecks,
  Users,
  BarChart3,
  Kanban,
  Settings,
  Bus,
  Shield,
  UserRoundCog,
  Handshake,
  LifeBuoy,
  Award,
  UserCog,
  Banknote,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  keywords?: string[];
  roles?: string[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export interface PortalConfig {
  personaLabel: string;
  personaTitle: string;
  homeHref: string;
  navGroups: NavGroup[];
  commandItems: NavItem[];
}

export function filterPortalConfigForRole(config: PortalConfig, role: string | undefined | null): PortalConfig {
  const normalizedRole = (role ?? '').trim();
  const navGroups = config.navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(normalizedRole)),
    }))
    .filter((group) => group.items.length > 0);
  const commandItems = config.commandItems.filter((item) => !item.roles || item.roles.includes(normalizedRole));

  return { ...config, navGroups, commandItems };
}

export const studentPortal: PortalConfig = {
  personaLabel: 'Student Portal',
  personaTitle: 'SGVU Academics',
  homeHref: '/student/dashboard',
  navGroups: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard, keywords: ['home', 'overview'] }],
    },
    {
      title: 'Academics',
      items: [
        { label: 'Academics & DA Uploads', href: '/student/academics', icon: GraduationCap, keywords: ['grades', 'attendance', 'results', 'digital assignments', 'cbcs'] },
        { label: 'Examinations', href: '/student/exams', icon: ClipboardList, keywords: ['exam', 'hall ticket', 'admit card', 'schedule'] },
      ],
    },
    {
      title: 'Campus Services',
      items: [
        { label: 'Hostel & Gate Pass', href: '/student/hostel', icon: Bus, keywords: ['room', 'mess', 'gate pass'] },
        { label: 'Finance & Fees', href: '/student/fees', icon: Wallet, keywords: ['fee demands', 'receipts', 'pay fees'] },
      ],
    },
    {
      title: 'Mentorship',
      items: [{ label: 'Proctor Connect', href: '/student/mentorship', icon: Handshake, keywords: ['mentor', 'meeting', 'leave'] }],
    },
    {
      title: 'Profile',
      items: [
        { label: 'My Profile & Vault', href: '/student/profile', icon: UserRoundCog, keywords: ['profile', 'bank', 'documents'] },
        { label: 'Achievements & Certifications', href: '/student/profile/certificates', icon: Award, keywords: ['certificate', 'course', 'workshop', 'sports', 'iqac'] },
      ],
    },
    {
      title: 'Support',
      items: [{ label: 'Helpdesk & Tickets', href: '/student/helpdesk', icon: LifeBuoy, keywords: ['tickets', 'support'] }],
    },
  ],
  commandItems: [
    { label: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard },
    { label: 'Academics & DA', href: '/student/academics', icon: GraduationCap },
    { label: 'Examinations', href: '/student/exams', icon: ClipboardList },
    { label: 'Hostel', href: '/student/hostel', icon: Bus },
    { label: 'Fees', href: '/student/fees', icon: Wallet },
    { label: 'Proctor Connect', href: '/student/mentorship', icon: Handshake },
    { label: 'My Profile', href: '/student/profile', icon: UserRoundCog },
    { label: 'Certificates', href: '/student/profile/certificates', icon: Award },
    { label: 'Helpdesk', href: '/student/helpdesk', icon: LifeBuoy },
  ],
};

export const facultyPortal: PortalConfig = {
  personaLabel: 'Faculty Portal',
  personaTitle: 'Faculty Workspace',
  homeHref: '/faculty/dashboard',
  navGroups: [
    {
      title: 'Home',
      items: [{ label: 'Dashboard', href: '/faculty/dashboard', icon: LayoutDashboard }],
    },
    {
      title: 'Academics',
      items: [
        { label: 'Academics, Attendance & DA', href: '/faculty/academics', icon: ClipboardCheck, keywords: ['attendance', 'class', 'materials', 'digital assignments', 'grade da'] },
        { label: 'Mentorship & Certificates', href: '/faculty/mentorship', icon: Handshake, keywords: ['proctor', 'mentor', 'certificates'] },
      ],
    },
    {
      title: 'HR',
      items: [{ label: 'HR & Employee Hub', href: '/faculty/leaves', icon: CalendarDays, keywords: ['leave', 'cl', 'sl', 'payslip', 'punch'] }],
    },
    {
      title: 'IQAC',
      items: [{ label: 'Falcon Core Tasks', href: '/faculty/iqac', icon: ListChecks, keywords: ['iqac', 'upload'] }],
    },
  ],
  commandItems: [
    { label: 'Academics, Attendance & DA', href: '/faculty/academics', icon: ClipboardCheck },
    { label: 'Mentorship & Certificates', href: '/faculty/mentorship', icon: Handshake },
    { label: 'HR & Employee Hub', href: '/faculty/leaves', icon: CalendarDays },
    { label: 'Falcon Core Tasks', href: '/faculty/iqac', icon: ListChecks },
  ],
};

export const hrPortal: PortalConfig = {
  personaLabel: 'HR Operations',
  personaTitle: 'HR Command Center',
  homeHref: '/hr/dashboard',
  navGroups: [
    {
      title: 'Core HR',
      items: [
        { label: 'Dashboard', href: '/hr/dashboard', icon: LayoutDashboard, keywords: ['metrics', 'actions'] },
        { label: 'Directory', href: '/hr/directory', icon: UserCog, keywords: ['employees', 'master', 'database'] },
      ],
    },
    {
      title: 'Time & Leave',
      items: [
        { label: 'Attendance Matrix', href: '/hr/attendance-matrix', icon: CalendarRange, keywords: ['attendance', 'month', 'calendar'] },
        { label: 'Leaves', href: '/hr/leaves', icon: CalendarDays, keywords: ['leave', 'hod approved', 'queue'] },
        { label: 'Holidays', href: '/hr/holidays', icon: ClipboardList, keywords: ['diwali', 'summer break', 'calendar'] },
      ],
    },
    {
      title: 'Payroll',
      items: [
        { label: 'Salary Structures', href: '/hr/payroll/structures', icon: Wallet, keywords: ['basic', 'hra', 'da', 'pf'] },
        { label: 'Run Payroll', href: '/hr/payroll/run', icon: Banknote, keywords: ['payslip', 'salary', 'bullmq'] },
      ],
    },
    {
      title: 'Recruitment',
      items: [
        { label: 'Job Postings', href: '/hr/recruitment/jobs', icon: ClipboardCheck, keywords: ['ats', 'jobs'] },
        { label: 'Pipeline', href: '/hr/recruitment/pipeline', icon: Kanban, keywords: ['kanban', 'applicants'] },
      ],
    },
    {
      title: 'Lifecycle',
      items: [
        { label: 'Onboarding', href: '/hr/onboarding', icon: Handshake, keywords: ['email', 'id card', 'workstation'] },
        { label: 'Offboarding', href: '/hr/offboarding', icon: Shield, keywords: ['no dues', 'clearance'] },
      ],
    },
    {
      title: 'PMS',
      items: [
        { label: 'Appraisals', href: '/hr/pms/appraisals', icon: Award, keywords: ['cycle', 'performance'] },
        { label: 'Faculty KPIs', href: '/hr/pms/faculty-kpis', icon: BarChart3, keywords: ['research', 'patents', 'feedback'] },
      ],
    },
  ],
  commandItems: [
    { label: 'HR Dashboard', href: '/hr/dashboard', icon: LayoutDashboard },
    { label: 'Directory', href: '/hr/directory', icon: UserCog },
    { label: 'Attendance Matrix', href: '/hr/attendance-matrix', icon: CalendarRange },
    { label: 'Leaves', href: '/hr/leaves', icon: CalendarDays },
    { label: 'Holidays', href: '/hr/holidays', icon: ClipboardList },
    { label: 'Salary Structures', href: '/hr/payroll/structures', icon: Wallet },
    { label: 'Run Payroll', href: '/hr/payroll/run', icon: Banknote },
    { label: 'Job Postings', href: '/hr/recruitment/jobs', icon: ClipboardCheck },
    { label: 'Pipeline', href: '/hr/recruitment/pipeline', icon: Kanban },
    { label: 'Onboarding', href: '/hr/onboarding', icon: Handshake },
    { label: 'Offboarding', href: '/hr/offboarding', icon: Shield },
    { label: 'Appraisals', href: '/hr/pms/appraisals', icon: Award },
    { label: 'Faculty KPIs', href: '/hr/pms/faculty-kpis', icon: BarChart3 },
  ],
};

export const hodPortal: PortalConfig = {
  personaLabel: 'HOD Workspace',
  personaTitle: 'Department Command Center',
  homeHref: '/hod/dashboard',
  navGroups: [
    {
      title: 'Department Health',
      items: [
        { label: 'Dashboard', href: '/hod/dashboard', icon: LayoutDashboard, keywords: ['snapshot', 'attendance'] },
        { label: 'Faculty Roster', href: '/hod/faculty-roster', icon: Users, keywords: ['faculty', 'course allocation', 'timetable'] },
        { label: 'Student Monitor', href: '/hod/student-monitor', icon: GraduationCap, keywords: ['students', 'low attendance'] },
      ],
    },
    {
      title: 'Approvals',
      items: [
        { label: 'Faculty Leaves', href: '/hod/approvals/leaves', icon: CalendarDays, keywords: ['cl', 'sl', 'el', 'leave approval'] },
        { label: 'Gate Passes', href: '/hod/approvals/gate-passes', icon: ClipboardCheck, keywords: ['mid duty', 'exit pass'] },
      ],
    },
  ],
  commandItems: [
    { label: 'HOD Dashboard', href: '/hod/dashboard', icon: LayoutDashboard },
    { label: 'Faculty Roster', href: '/hod/faculty-roster', icon: Users },
    { label: 'Student Monitor', href: '/hod/student-monitor', icon: GraduationCap },
    { label: 'Faculty Leaves', href: '/hod/approvals/leaves', icon: CalendarDays },
    { label: 'Gate Passes', href: '/hod/approvals/gate-passes', icon: ClipboardCheck },
  ],
};

export const hostelAdminPortal: PortalConfig = {
  personaLabel: 'Hostel Administration',
  personaTitle: 'Residential Operations',
  homeHref: '/hostel-admin/dashboard',
  navGroups: [
    {
      title: 'Hostel Ops',
      items: [
        { label: 'Allocations', href: '/hostel-admin/allocations', icon: Users, keywords: ['block', 'room', 'mess'] },
        { label: 'Gate Pass Desk', href: '/hostel-admin/gate-passes', icon: ClipboardCheck, keywords: ['approve', 'reject', 'student'] },
        { label: 'Out-of-Campus Logs', href: '/hostel-admin/logs', icon: ClipboardList, keywords: ['live', 'out', 'campus'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Hostel Dashboard', href: '/hostel-admin/dashboard', icon: LayoutDashboard },
    { label: 'Allocations', href: '/hostel-admin/allocations', icon: Users },
    { label: 'Gate Pass Desk', href: '/hostel-admin/gate-passes', icon: ClipboardCheck },
    { label: 'Out Logs', href: '/hostel-admin/logs', icon: ClipboardList },
  ],
};

export const financePortal: PortalConfig = {
  personaLabel: 'Finance Office',
  personaTitle: 'Fees & Accounts',
  homeHref: '/finance/dashboard',
  navGroups: [
    {
      title: 'Finance Control',
      items: [
        { label: 'Dashboard', href: '/finance/dashboard', icon: LayoutDashboard, keywords: ['collection', 'outstanding'] },
        { label: 'Fee Demands', href: '/finance/fee-demands', icon: Wallet, keywords: ['bulk', 'semester', 'fees', 'invoices'] },
        { label: 'Transactions', href: '/finance/transactions', icon: Banknote, keywords: ['ledger', 'receipt', 'razorpay'] },
        { label: 'Defaulters', href: '/finance/defaulters', icon: Shield, keywords: ['dues', 'admit card lock'] },
        { label: 'Scholarships', href: '/finance/scholarships', icon: Award, keywords: ['waiver', 'discount'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Finance Dashboard', href: '/finance/dashboard', icon: LayoutDashboard },
    { label: 'Fee Demands', href: '/finance/fee-demands', icon: Wallet },
    { label: 'Transactions', href: '/finance/transactions', icon: Banknote },
    { label: 'Defaulters', href: '/finance/defaulters', icon: Shield },
    { label: 'Scholarships', href: '/finance/scholarships', icon: Award },
  ],
};

export const iqacPortal: PortalConfig = {
  personaLabel: 'IQAC Administration',
  personaTitle: 'Falcon Core · Compliance',
  homeHref: '/iqac/dashboard',
  navGroups: [
    {
      title: 'Accreditation',
      items: [
        { label: 'Dashboard', href: '/iqac/dashboard', icon: LayoutDashboard, keywords: ['heat map', 'departments'] },
        { label: 'Task Master', href: '/iqac/task-master', icon: ListChecks, keywords: ['recurring', 'monthly', 'governance'] },
        { label: 'Document Vault', href: '/iqac/document-vault', icon: ClipboardList, keywords: ['ai', 'gemini', 'submissions'] },
        { label: 'Student Achievements', href: '/iqac/student-achievements', icon: Award, keywords: ['certificates', 'naac points'] },
        { label: 'Export Center', href: '/iqac/export-center', icon: BarChart3, keywords: ['excel', 'reports', 'accreditation'] },
      ],
    },
  ],
  commandItems: [
    { label: 'IQAC Dashboard', href: '/iqac/dashboard', icon: LayoutDashboard },
    { label: 'Task Master', href: '/iqac/task-master', icon: ListChecks },
    { label: 'Document Vault', href: '/iqac/document-vault', icon: ClipboardList },
    { label: 'Student Achievements', href: '/iqac/student-achievements', icon: Award },
    { label: 'Export Center', href: '/iqac/export-center', icon: BarChart3 },
  ],
};

export const libraryPortal: PortalConfig = {
  personaLabel: 'Library',
  personaTitle: 'Catalog & Circulation',
  homeHref: '/library/dashboard',
  navGroups: [
    {
      title: 'Library',
      items: [
        { label: 'Catalog', href: '/library/catalog', icon: ClipboardList, keywords: ['search', 'add books'] },
        { label: 'Circulation', href: '/library/circulation', icon: Users, keywords: ['issue', 'return'] },
        { label: 'Overdue Fines', href: '/library/fines', icon: Banknote, keywords: ['finance sync'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Library Dashboard', href: '/library/dashboard', icon: LayoutDashboard },
    { label: 'Catalog', href: '/library/catalog', icon: ClipboardList },
    { label: 'Circulation', href: '/library/circulation', icon: Users },
    { label: 'Overdue Fines', href: '/library/fines', icon: Banknote },
  ],
};

export const parentPortal: PortalConfig = {
  personaLabel: 'Parent Portal',
  personaTitle: 'Student Guardian View',
  homeHref: '/parent/dashboard',
  navGroups: [
    {
      title: 'Child Overview',
      items: [
        { label: 'Dashboard', href: '/parent/dashboard', icon: LayoutDashboard, keywords: ['child', 'overview'] },
        { label: 'Attendance', href: '/parent/attendance', icon: CalendarRange, keywords: ['attendance'] },
        { label: 'Marks', href: '/parent/marks', icon: GraduationCap, keywords: ['mid term', 'end term', 'grade'] },
        { label: 'Fee Dues', href: '/parent/fees', icon: Wallet, keywords: ['dues', 'fees'] },
        { label: 'Discipline', href: '/parent/discipline', icon: Shield, keywords: ['discipline', 'records'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Parent Dashboard', href: '/parent/dashboard', icon: LayoutDashboard },
    { label: 'Attendance', href: '/parent/attendance', icon: CalendarRange },
    { label: 'Marks', href: '/parent/marks', icon: GraduationCap },
    { label: 'Fee Dues', href: '/parent/fees', icon: Wallet },
    { label: 'Discipline', href: '/parent/discipline', icon: Shield },
  ],
};

export const examCellPortal: PortalConfig = {
  personaLabel: 'Exam Cell',
  personaTitle: 'Assessment Control',
  homeHref: '/exam-cell/dashboard',
  navGroups: [
    {
      title: 'Exam Operations',
      items: [
        { label: 'Dashboard', href: '/exam-cell/dashboard', icon: LayoutDashboard, keywords: ['exam cell'] },
        { label: 'Seating Plans', href: '/exam-cell/seating-plans', icon: ClipboardList, keywords: ['seating', 'rooms'] },
        { label: 'Grade Cards', href: '/exam-cell/grade-cards', icon: Award, keywords: ['grade cards'] },
        { label: 'UFM Cases', href: '/exam-cell/ufm-cases', icon: Shield, keywords: ['cheating', 'unfair means'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Exam Cell Dashboard', href: '/exam-cell/dashboard', icon: LayoutDashboard },
    { label: 'Seating Plans', href: '/exam-cell/seating-plans', icon: ClipboardList },
    { label: 'Grade Cards', href: '/exam-cell/grade-cards', icon: Award },
    { label: 'UFM Cases', href: '/exam-cell/ufm-cases', icon: Shield },
  ],
};

export const presidentPortal: PortalConfig = {
  personaLabel: 'President / VC',
  personaTitle: 'Executive Dashboard',
  homeHref: '/president/executive-summary',
  navGroups: [
    {
      title: 'Executive Analytics',
      items: [
        { label: 'Executive Summary', href: '/president/executive-summary', icon: LayoutDashboard, keywords: ['revenue', 'headcount'] },
        { label: 'Academics', href: '/president/academics', icon: GraduationCap, keywords: ['pass fail', 'attendance', 'schools'] },
        { label: 'Finance', href: '/president/finance', icon: Wallet, keywords: ['collected', 'pending', 'charts'] },
        { label: 'Compliance', href: '/president/compliance', icon: Shield, keywords: ['iqac', 'defaulting'] },
        { label: 'HR Analytics', href: '/president/hr-analytics', icon: Users, keywords: ['retention', 'faculty student ratio', 'payroll'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Executive Summary', href: '/president/executive-summary', icon: LayoutDashboard },
    { label: 'Academics', href: '/president/academics', icon: GraduationCap },
    { label: 'Finance', href: '/president/finance', icon: Wallet },
    { label: 'Compliance', href: '/president/compliance', icon: Shield },
    { label: 'HR Analytics', href: '/president/hr-analytics', icon: Users },
  ],
};

export const adminPortal: PortalConfig = {
  personaLabel: 'Management',
  personaTitle: 'Falcon Admin Console',
  homeHref: '/admin/dashboard',
  navGroups: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
        { label: 'IQAC Admin', href: '/dashboard', icon: ListChecks },
      ],
    },
    {
      title: 'Modules',
      items: [
        { label: 'IAM & Hierarchy', href: '/admin/iam', icon: Shield, roles: ['SuperAdmin', 'Registrar'] },
        { label: 'Admissions CRM', href: '/admin/admissions', icon: Kanban, roles: ['SuperAdmin', 'AdmissionsOfficer'] },
        { label: 'Academics', href: '/admin/academics', icon: GraduationCap, roles: ['SuperAdmin', 'Registrar'] },
        { label: 'Finance', href: '/admin/finance', icon: Wallet, roles: ['SuperAdmin', 'Accountant', 'President'] },
        { label: 'HR & Payroll', href: '/admin/hr', icon: Users, roles: ['SuperAdmin', 'HR', 'President'] },
        { label: 'IQAC & Placements', href: '/admin/iqac', icon: BarChart3, roles: ['SuperAdmin', 'IQAC', 'PlacementCell', 'President'] },
        { label: 'Operations', href: '/admin/operations', icon: Bus, roles: ['SuperAdmin', 'Warden', 'Librarian', 'TransportOfficer'] },
        { label: 'Settings & IT', href: '/admin/settings', icon: Settings, roles: ['SuperAdmin'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Admissions Kanban', href: '/admin/admissions', icon: Kanban, roles: ['SuperAdmin', 'AdmissionsOfficer'] },
    { label: 'Pending Approvals', href: '/admin/dashboard', icon: ListChecks },
    { label: 'Export Reports', href: '/admin/dashboard', icon: BarChart3, roles: ['SuperAdmin', 'President', 'IQAC'] },
  ],
};
