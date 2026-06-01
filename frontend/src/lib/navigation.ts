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
  BookOpen,
  FileText,
  PenLine,
  Eye,
  FlaskConical,
  LineChart,
  NotebookPen,
  CalendarClock,
  Microscope,
  FolderLock,
  Timer,
  ArrowUpCircle,
  Briefcase,
  Archive,
  DoorOpen,
  Medal,
  Library,
  BusFront,
  TrendingUp,
  Heart,
  Calendar,
  CheckCircle,
  DollarSign,
  Network,
  Building2,
  Receipt,
  Landmark,
  BookMarked,
  FileSpreadsheet,
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
  personaTitle: 'SGVU Student Life',
  homeHref: '/student/dashboard',
  navGroups: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard, keywords: ['home', 'overview'] }],
    },
    {
      title: 'Profile & Admission Hub',
      items: [
        { label: 'My Profile & Master Data', href: '/student/profile', icon: UserRoundCog, keywords: ['profile', 'aadhaar', 'scholarship', 'enrollment'] },
        { label: 'Admission & Document Vault', href: '/student/admission-vault', icon: Archive, keywords: ['admission', 'counseling', 'entrance', 'migration'] },
        { label: 'Exit & Alumni Transition', href: '/student/exit', icon: DoorOpen, keywords: ['no dues', 'degree', 'alumni', 'graduation'] },
      ],
    },
    {
      title: 'Academics & Examinations',
      items: [
        { label: 'Subjects & Registration (CBCS)', href: '/student/registration', icon: BookOpen, keywords: ['cbcs', 'electives', 'credits', 'courses'] },
        { label: 'Attendance & Progression', href: '/student/attendance', icon: ClipboardCheck, keywords: ['attendance', 'semester', 'progression'] },
        { label: 'Marks & Grade Cards', href: '/student/marks', icon: TrendingUp, keywords: ['sgpa', 'cgpa', 'backlog', 'atkt', 'grades'] },
        { label: 'Exam Desk', href: '/student/exams', icon: ClipboardList, keywords: ['admit card', 'seating', 'ufm', 'revaluation'] },
      ],
    },
    {
      title: 'Campus Services',
      items: [
        { label: 'Hostel & Mess', href: '/student/hostel', icon: Bus, keywords: ['hostel', 'mess', 'gate pass', 'room'] },
        { label: 'Transport Hub', href: '/student/transport', icon: BusFront, keywords: ['bus', 'route', 'transport'] },
        { label: 'Library & Dues', href: '/student/library', icon: Library, keywords: ['library', 'books', 'fines'] },
        { label: 'Extra-Curriculars', href: '/student/extracurriculars', icon: Medal, keywords: ['ncc', 'nss', 'sodeca', 'credits'] },
      ],
    },
    {
      title: 'Support & Placements',
      items: [
        { label: 'Mentorship (Proctor)', href: '/student/mentorship', icon: Handshake, keywords: ['proctor', 'mentor', 'meeting'] },
        { label: 'Placements & Internships', href: '/student/placements', icon: Briefcase, keywords: ['placement', 'jobs', 'internship'] },
        { label: 'Grievances & Helpdesk', href: '/student/helpdesk', icon: LifeBuoy, keywords: ['tickets', 'discipline', 'grievance'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard },
    { label: 'My Profile', href: '/student/profile', icon: UserRoundCog },
    { label: 'Admission Vault', href: '/student/admission-vault', icon: Archive },
    { label: 'CBCS Registration', href: '/student/registration', icon: BookOpen },
    { label: 'Attendance', href: '/student/attendance', icon: ClipboardCheck },
    { label: 'Marks', href: '/student/marks', icon: TrendingUp },
    { label: 'Exam Desk', href: '/student/exams', icon: ClipboardList },
    { label: 'Hostel', href: '/student/hostel', icon: Bus },
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
      title: 'Academics & Teaching',
      items: [
        { label: 'Timetable & Extra Classes', href: '/faculty/timetable', icon: CalendarClock, keywords: ['schedule', 'substitute', 'cancel', 'ltp'] },
        { label: 'Mark Attendance', href: '/faculty/attendance', icon: ClipboardCheck, keywords: ['attendance', 'present', 'absent'] },
        { label: 'Course Page & Syllabus', href: '/faculty/courses', icon: BookOpen, keywords: ['lesson plan', 'handout', 'materials', 'ppt'] },
        { label: 'Digital Assignments (DA)', href: '/faculty/assignments', icon: FileText, keywords: ['da', 'submission', 'deadline'] },
        { label: 'Examinations & Grading', href: '/faculty/grading', icon: PenLine, keywords: ['marks', 'cat', 'fat', 'quiz'] },
        { label: 'CO-PO Mapping', href: '/faculty/grading/copo', icon: GraduationCap, keywords: ['nba', 'naac', 'outcomes', 'co', 'po'] },
        { label: 'Student Analytics', href: '/faculty/analytics', icon: LineChart, keywords: ['slow learners', 'remedial', 'attendance'] },
        { label: 'Digital Class Logbook', href: '/faculty/logbook', icon: NotebookPen, keywords: ['lecture', 'topic', 'log'] },
      ],
    },
    {
      title: 'Students & Mentoring',
      items: [
        { label: 'Mentorship & Approvals', href: '/faculty/mentorship', icon: Handshake, keywords: ['proctor', 'mentor', 'certificates'] },
        { label: 'Project & Lab Guides', href: '/faculty/projects', icon: Microscope, keywords: ['b.tech', 'mba', 'weekly report', 'guide'] },
      ],
    },
    {
      title: 'Research & Duties',
      items: [
        { label: 'Exam Invigilation Duty', href: '/faculty/invigilation', icon: Eye, keywords: ['exam cell', 'room', 'supervisor'] },
        { label: 'Research & Publications', href: '/faculty/research', icon: FlaskConical, keywords: ['scopus', 'patent', 'journal', 'pms'] },
      ],
    },
    {
      title: 'Administration',
      items: [
        { label: 'HR & Employee Hub', href: '/faculty/leaves', icon: CalendarDays, keywords: ['leave', 'cl', 'sl', 'payslip', 'punch'] },
        { label: 'Falcon Core Tasks (IQAC)', href: '/faculty/iqac', icon: ListChecks, keywords: ['iqac', 'upload', 'tasks'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Dashboard', href: '/faculty/dashboard', icon: LayoutDashboard },
    { label: 'Timetable & Extra Classes', href: '/faculty/timetable', icon: CalendarClock },
    { label: 'Mark Attendance', href: '/faculty/attendance', icon: ClipboardCheck },
    { label: 'Course Page & Syllabus', href: '/faculty/courses', icon: BookOpen },
    { label: 'Digital Assignments', href: '/faculty/assignments', icon: FileText },
    { label: 'Examinations & Grading', href: '/faculty/grading', icon: PenLine },
    { label: 'CO-PO Mapping', href: '/faculty/grading/copo', icon: GraduationCap },
    { label: 'Mentorship & Approvals', href: '/faculty/mentorship', icon: Handshake },
    { label: 'Project & Lab Guides', href: '/faculty/projects', icon: Microscope },
    { label: 'Exam Invigilation', href: '/faculty/invigilation', icon: Eye },
    { label: 'Research & Publications', href: '/faculty/research', icon: FlaskConical },
    { label: 'HR & Employee Hub', href: '/faculty/leaves', icon: CalendarDays },
    { label: 'Falcon Core Tasks', href: '/faculty/iqac', icon: ListChecks },
    { label: 'Student Analytics', href: '/faculty/analytics', icon: LineChart },
    { label: 'Class Logbook', href: '/faculty/logbook', icon: NotebookPen },
  ],
};

export const hrPortal: PortalConfig = {
  personaLabel: 'HR Operations',
  personaTitle: 'Falcon HRMS',
  homeHref: '/hr/dashboard',
  navGroups: [
    {
      title: 'Home',
      items: [{ label: 'Dashboard', href: '/hr/dashboard', icon: LayoutDashboard, keywords: ['metrics', 'actions'] }],
    },
    {
      title: 'Employee Master',
      items: [
        { label: 'Employee Directory', href: '/hr/directory', icon: Users, keywords: ['staff', '500', 'roster'] },
        { label: 'KYC & Document Vault', href: '/hr/kyc', icon: FolderLock, keywords: ['pan', 'aadhaar', 'bank', 'encrypted'] },
      ],
    },
    {
      title: 'Time & Leaves',
      items: [
        { label: 'Attendance & Biometrics', href: '/hr/attendance', icon: Timer, keywords: ['matrix', 'punch', 'late', 'half day'] },
        { label: 'Leave Management & Balances', href: '/hr/leaves', icon: CalendarDays, keywords: ['cl', 'sl', 'el', 'maternity', 'approval'] },
      ],
    },
    {
      title: 'Payroll & Finance',
      items: [
        { label: 'Salary Structures', href: '/hr/payroll/structures', icon: Wallet, keywords: ['basic', 'hra', 'da', 'pf', 'tds'] },
        { label: 'Payroll Processing', href: '/hr/payroll/processing', icon: Banknote, keywords: ['run payroll', 'payslip', 'lwp'] },
      ],
    },
    {
      title: 'Performance & Lifecycle',
      items: [
        { label: 'Recruitment (ATS)', href: '/hr/recruitment', icon: Briefcase, keywords: ['kanban', 'hired', 'interview'] },
        { label: 'Appraisals & API Scores', href: '/hr/appraisals', icon: Award, keywords: ['ugc', 'api', 'scopus', 'research'] },
        { label: 'Promotions & Workflows', href: '/hr/promotions', icon: ArrowUpCircle, keywords: ['associate prof', 'professor', 'eligible'] },
      ],
    },
  ],
  commandItems: [
    { label: 'HR Dashboard', href: '/hr/dashboard', icon: LayoutDashboard },
    { label: 'Employee Directory', href: '/hr/directory', icon: Users },
    { label: 'KYC Vault', href: '/hr/kyc', icon: FolderLock },
    { label: 'Attendance & Biometrics', href: '/hr/attendance', icon: Timer },
    { label: 'Leave Management', href: '/hr/leaves', icon: CalendarDays },
    { label: 'Salary Structures', href: '/hr/payroll/structures', icon: Wallet },
    { label: 'Payroll Processing', href: '/hr/payroll/processing', icon: Banknote },
    { label: 'Recruitment ATS', href: '/hr/recruitment', icon: Briefcase },
    { label: 'Appraisals & API', href: '/hr/appraisals', icon: Award },
    { label: 'Promotions', href: '/hr/promotions', icon: ArrowUpCircle },
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
  personaTitle: 'Finance & Accounts',
  homeHref: '/finance/dashboard',
  navGroups: [
    {
      title: 'Overview',
      items: [
        { label: 'Finance Dashboard', href: '/finance/dashboard', icon: LayoutDashboard, keywords: ['cash flow', 'collection', 'budget'] },
      ],
    },
    {
      title: 'Receivables (Student Revenue)',
      items: [
        { label: 'Fee Structures & Demands', href: '/finance/fee-structures', icon: Wallet, keywords: ['template', 'batch', 'invoice'] },
        { label: 'Collections & Receipts', href: '/finance/collections', icon: Banknote, keywords: ['razorpay', 'payu', 'gateway'] },
        { label: 'Scholarships & Waivers', href: '/finance/scholarships', icon: Award, keywords: ['discount', 'waiver'] },
      ],
    },
    {
      title: 'Payables & Expenses',
      items: [
        { label: 'Vendor Master', href: '/finance/vendors', icon: Building2, keywords: ['gstin', 'tds', 'supplier'] },
        { label: 'Expense Heads & Bills', href: '/finance/expenses', icon: Receipt, keywords: ['gst', 'invoice', 'maintenance'] },
        { label: 'Salary Processing', href: '/finance/salary-processing', icon: Landmark, keywords: ['neft', 'rtgs', 'payroll'] },
      ],
    },
    {
      title: 'Core Accounting',
      items: [
        { label: 'Ledger Accounts', href: '/finance/ledger', icon: BookMarked, keywords: ['double entry', 'chart of accounts'] },
        { label: 'Budget Allocation', href: '/finance/budgets', icon: TrendingUp, keywords: ['department', 'utilization'] },
        { label: 'Audit Reports', href: '/finance/audit-reports', icon: FileSpreadsheet, keywords: ['trial balance', 'gstr', 'day book'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Finance Dashboard', href: '/finance/dashboard', icon: LayoutDashboard },
    { label: 'Fee Structures', href: '/finance/fee-structures', icon: Wallet },
    { label: 'Collections', href: '/finance/collections', icon: Banknote },
    { label: 'Vendors', href: '/finance/vendors', icon: Building2 },
    { label: 'Audit Reports', href: '/finance/audit-reports', icon: FileSpreadsheet },
  ],
};

export const iqacPortal: PortalConfig = {
  personaLabel: 'IQAC Administration',
  personaTitle: 'Central Monitoring & Analytics',
  homeHref: '/iqac/dashboard',
  navGroups: [
    {
      title: 'Analytics & KPI',
      items: [
        { label: 'Master KPI Dashboard', href: '/iqac/dashboard', icon: LayoutDashboard, keywords: ['fsr', 'phd', 'grants'] },
        { label: 'Ranking Analytics (NIRF)', href: '/iqac/ranking', icon: LineChart, keywords: ['nirf', 'simulation', 'ranking'] },
      ],
    },
    {
      title: 'Faculty & Academic Data',
      items: [
        { label: 'Faculty Contributions', href: '/iqac/faculty-data', icon: Users, keywords: ['publications', 'patents', 'fdp'] },
        { label: 'Academic Audits & Feedback', href: '/iqac/audits', icon: ClipboardCheck, keywords: ['sss', 'survey', 'feedback'] },
      ],
    },
    {
      title: 'Student Outcomes',
      items: [
        { label: 'Progression & Placements', href: '/iqac/student-outcomes', icon: GraduationCap, keywords: ['lpa', 'alumni', 'placed'] },
        { label: 'Student Achievements', href: '/iqac/student-achievements', icon: Award, keywords: ['certificates', 'naac'] },
      ],
    },
    {
      title: 'Alumni Relations',
      items: [
        { label: 'Alumni Verification', href: '/iqac/alumni/verification', icon: CheckCircle, keywords: ['approve', 'pending'] },
        { label: 'Donation Ledger', href: '/iqac/alumni/donations', icon: DollarSign, keywords: ['endowment', '80g'] },
        { label: 'Alumni Events', href: '/iqac/alumni/events', icon: Calendar, keywords: ['rsvp', 'meet'] },
      ],
    },
    {
      title: 'Accreditation & Reports',
      items: [
        { label: 'NAAC Document Repository', href: '/iqac/repository', icon: FolderLock, keywords: ['criterion', '7 criteria', 'vault'] },
        { label: 'Report Generator (AQAR & SSR)', href: '/iqac/reports', icon: FileText, keywords: ['aqar', 'ssr', 'pdf'] },
        { label: 'Falcon Core Tasks', href: '/iqac/tasks', icon: ListChecks, keywords: ['task master', 'ai', 'submissions'] },
      ],
    },
  ],
  commandItems: [
    { label: 'KPI Dashboard', href: '/iqac/dashboard', icon: LayoutDashboard },
    { label: 'NIRF Analytics', href: '/iqac/ranking', icon: LineChart },
    { label: 'Faculty Data', href: '/iqac/faculty-data', icon: Users },
    { label: 'NAAC Repository', href: '/iqac/repository', icon: FolderLock },
    { label: 'AQAR / SSR Reports', href: '/iqac/reports', icon: FileText },
    { label: 'Alumni Verification', href: '/iqac/alumni/verification', icon: CheckCircle },
    { label: 'Falcon Core Tasks', href: '/iqac/tasks', icon: ListChecks },
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

export const alumniPortal: PortalConfig = {
  personaLabel: 'Falcon Alumni Network',
  personaTitle: 'Graduate Portal',
  homeHref: '/alumni/dashboard',
  navGroups: [
    {
      title: 'Alumni Network',
      items: [
        { label: 'Dashboard', href: '/alumni/dashboard', icon: LayoutDashboard, keywords: ['overview', 'alumni'] },
        { label: 'My Career Profile', href: '/alumni/profile', icon: UserCog, keywords: ['organization', 'linkedin', 'higher education'] },
        { label: 'Alumni Directory', href: '/alumni/directory', icon: Network, keywords: ['batch', 'network', 'microsoft'] },
        { label: 'Mentorship Program', href: '/alumni/mentorship', icon: Handshake, keywords: ['mentor', 'guidance', 'students'] },
        { label: 'Giving Back', href: '/alumni/donations', icon: Heart, keywords: ['donation', '80g', 'razorpay', 'endowment'] },
        { label: 'Alumni Events', href: '/alumni/events', icon: Calendar, keywords: ['meet', 'rsvp', 'guest lecture'] },
        { label: 'University Services', href: '/alumni/services', icon: FileText, keywords: ['transcript', 'migration', 'degree'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Alumni Dashboard', href: '/alumni/dashboard', icon: LayoutDashboard },
    { label: 'Career Profile', href: '/alumni/profile', icon: UserCog },
    { label: 'Directory', href: '/alumni/directory', icon: Network },
    { label: 'Donations', href: '/alumni/donations', icon: Heart },
    { label: 'Events', href: '/alumni/events', icon: Calendar },
  ],
};

export const adminOpsPortal: PortalConfig = {
  personaLabel: 'Campus Administration',
  personaTitle: 'Registrar & Facilities',
  homeHref: '/admin-ops/dashboard',
  navGroups: [
    {
      title: 'Admin Ops',
      items: [
        { label: 'Dashboard', href: '/admin-ops/dashboard', icon: LayoutDashboard },
        { label: 'Inventory & Assets', href: '/admin-ops/assets', icon: Archive },
        { label: 'Fleet & Transport', href: '/admin-ops/fleet', icon: Bus },
        { label: 'Event Management', href: '/admin-ops/events', icon: Calendar },
        { label: 'Master Timetable', href: '/admin-ops/timetable', icon: CalendarClock },
      ],
    },
  ],
  commandItems: [
    { label: 'Assets', href: '/admin-ops/assets', icon: Archive },
    { label: 'Fleet', href: '/admin-ops/fleet', icon: Bus },
    { label: 'Timetable', href: '/admin-ops/timetable', icon: CalendarClock },
  ],
};

export const placementPortal: PortalConfig = {
  personaLabel: 'Placement Cell',
  personaTitle: 'Training & Placements ATS',
  homeHref: '/placements/dashboard',
  navGroups: [
    {
      title: 'Campus Recruitment',
      items: [
        { label: 'Dashboard', href: '/placements/dashboard', icon: LayoutDashboard },
        { label: 'Company Master', href: '/placements/companies', icon: Building2 },
        { label: 'Placement Drives', href: '/placements/drives', icon: Briefcase },
        { label: 'Skill & Training', href: '/placements/training', icon: GraduationCap },
        { label: 'Mock Interviews', href: '/placements/mock-interviews', icon: Users },
        { label: 'Resume Builder', href: '/placements/resumes', icon: FileText },
      ],
    },
  ],
  commandItems: [
    { label: 'Companies', href: '/placements/companies', icon: Building2 },
    { label: 'Drives', href: '/placements/drives', icon: Briefcase },
  ],
};

/** Legacy portal key — routes redirect to IQAC; nav mirrors iqacPortal. */
export const alumniAdminPortal: PortalConfig = {
  ...iqacPortal,
  homeHref: '/iqac/alumni/verification',
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
