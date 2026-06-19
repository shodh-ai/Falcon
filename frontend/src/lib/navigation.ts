import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Wallet,
  GraduationCap,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
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
  Inbox,
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
  Ticket,
  UtensilsCrossed,
  Bell,
  QrCode,
  BedDouble,
  PartyPopper,
  ClipboardPen,
  MapPin,
  AlertTriangle,
  Contact,
} from 'lucide-react';
import { selfServicePaths, type WorkspacePrefix } from '@/lib/workspace-self-service';

export type HrModuleKey =
  | 'onboarding'
  | 'offboarding'
  | 'payroll'
  | 'biometrics'
  | 'leaves'
  | 'documents'
  | 'policies'
  | 'rules'
  | 'directory'
  | 'attendance'
  | 'recruitment'
  | 'reports'
  | 'dashboard';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  keywords?: string[];
  roles?: string[];
  hrModule?: HrModuleKey;
  /** Shorter label for mobile bottom nav */
  shortLabel?: string;
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
  /** Optional override for mobile bottom nav (defaults to first 4 command items) */
  mobileNavItems?: NavItem[];
}

/** Build command palette items from sidebar nav so search keywords stay in sync. */
/** Self-service links embedded in Faculty / HOD / HR sidebars (formerly ESS portal). */
export function myHrOperationsNavGroup(prefix: WorkspacePrefix): NavGroup {
  const p = selfServicePaths(prefix);
  return {
    title: 'My HR & Operations',
    items: [
      {
        label: 'My Profile & Documents',
        href: prefix === 'hr' ? p.documents : p.profile,
        icon: UserCog,
        keywords: [
          'profile',
          'naac',
          'iqac',
          'qualifications',
          'orcid',
          'kyc',
          'aadhaar',
          'pan',
          'vault',
          'documents',
          'degree',
        ],
      },
      {
        label: 'Attendance & Holidays Calendar',
        href: prefix === 'hr' ? '/hr/me/attendance-holidays' : p.workforce,
        icon: CalendarDays,
        keywords: ['leave', 'cl', 'sl', 'attendance', 'calendar', 'holidays', 'regularize'],
      },
      {
        label: 'My Payslips & Tax',
        href: p.payslips,
        icon: Banknote,
        keywords: ['payslip', 'salary', 'form 16', 'tax'],
      },
      {
        label: 'Company Policies',
        href: p.policies,
        icon: FileText,
        keywords: ['policies', 'posh', 'leave policy', 'cms', 'vote'],
      },
      {
        label: 'My Helpdesk Tickets',
        href: p.tickets,
        icon: Ticket,
        keywords: ['it', 'ticket', 'support', 'grievance'],
      },
    ],
  };
}

export function flattenNavToCommandItems(navGroups: NavGroup[]): NavItem[] {
  const seen = new Set<string>();
  const items: NavItem[] = [];
  for (const group of navGroups) {
    for (const item of group.items) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      items.push(item);
    }
  }
  return items;
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

export type HrCapabilities = Partial<Record<HrModuleKey, 'none' | 'read' | 'write'>>;

const HR_FULL_ACCESS_ROLES = new Set(['HRAdmin', 'SuperAdmin', 'HR']);

function hasHrPermission(
  permissions: string[] | undefined,
  module: HrModuleKey,
  minLevel: 'read' | 'write' = 'read',
): boolean {
  if (!permissions?.length) return false;
  const levels = minLevel === 'write' ? ['write'] : ['read', 'write'];
  return permissions.some((p) => {
    const [mod, level] = p.split(':');
    return mod === module && levels.includes(level);
  });
}

function canSeeHrNavItem(
  item: NavItem,
  role: string,
  caps?: HrCapabilities | null,
  permissions?: string[],
): boolean {
  if (item.roles && !item.roles.includes(role)) return false;
  if (HR_FULL_ACCESS_ROLES.has(role)) return true;
  if (!item.hrModule) return true;
  if (permissions?.length) {
    return hasHrPermission(permissions, item.hrModule, 'read');
  }
  const access = caps?.[item.hrModule] ?? 'none';
  return access !== 'none';
}

export function filterPortalConfigForHrCapabilities(
  config: PortalConfig,
  role: string | undefined | null,
  caps?: HrCapabilities | null,
  permissions?: string[],
): PortalConfig {
  const normalizedRole = (role ?? '').trim();
  const navGroups = config.navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSeeHrNavItem(item, normalizedRole, caps, permissions)),
    }))
    .filter((group) => group.items.length > 0);
  const commandItems = config.commandItems.filter((item) =>
    canSeeHrNavItem(item, normalizedRole, caps, permissions),
  );
  return { ...config, navGroups, commandItems };
}

/** Hide team-approval routes from faculty unless they manage direct reports. */
export function filterFacultyPortalForManagerAccess(
  config: PortalConfig,
  canSeeTeamApprovals: boolean,
): PortalConfig {
  if (canSeeTeamApprovals) return config;
  const hidden = new Set(['/faculty/inbox', '/faculty/team-requests']);
  const navGroups = config.navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !hidden.has(item.href)),
    }))
    .filter((group) => group.items.length > 0);
  const commandItems = config.commandItems.filter((item) => !hidden.has(item.href));
  return { ...config, navGroups, commandItems };
}

export const studentPortal: PortalConfig = {
  personaLabel: 'Falcon Student',
  personaTitle: 'Falcon Student Life',
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
        { label: 'My Financial Ledger', href: '/student/finance', icon: Wallet, keywords: ['fees', 'pay', 'dues', 'razorpay'] },
        { label: 'Campus Life', href: '/student/campus-life', icon: Bus, keywords: ['hostel', 'mess', 'gate pass', 'wallet', 'campus'] },
        { label: 'Transport Hub', href: '/student/transport', icon: BusFront, keywords: ['bus', 'route', 'transport'] },
        { label: 'Library & Dues', href: '/student/library', icon: Library, keywords: ['library', 'books', 'fines'] },
        { label: 'Falcon Events', href: '/student/falcon-events', icon: PartyPopper, keywords: ['clubs', 'tickets', 'ncc', 'nss', 'fest'] },
      ],
    },
    {
      title: 'Support & Placements',
      items: [
        { label: 'Mentorship', href: '/student/mentorship', icon: Handshake, keywords: ['mentor', 'mentee', 'meeting'] },
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
    { label: 'Financial Ledger', href: '/student/finance', icon: Wallet },
    { label: 'Campus Life', href: '/student/campus-life', icon: Bus },
    { label: 'Falcon Events', href: '/student/falcon-events', icon: PartyPopper },
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
        { label: 'Course Page & Syllabus', href: '/faculty/courses', icon: BookOpen, keywords: ['lesson plan', 'handout', 'materials', 'ppt', 'da', 'digital assignment', 'submission', 'deadline'] },
        { label: 'Examinations & Grading', href: '/faculty/grading', icon: PenLine, keywords: ['marks', 'cat', 'fat', 'quiz'] },
        { label: 'CO-PO Mapping', href: '/faculty/grading/copo', icon: GraduationCap, keywords: ['nba', 'naac', 'outcomes', 'co', 'po'] },
        { label: 'Student Analytics', href: '/faculty/analytics', icon: LineChart, keywords: ['slow learners', 'remedial', 'attendance'] },
        { label: 'Digital Class Logbook', href: '/faculty/logbook', icon: NotebookPen, keywords: ['lecture', 'topic', 'log'] },
      ],
    },
    {
      title: 'Students & Mentoring',
      items: [
        { label: 'Mentorship & Approvals', href: '/faculty/mentorship', icon: Handshake, keywords: ['mentor', 'mentee', 'certificates'] },
        { label: 'Project & Lab Guides', href: '/faculty/projects', icon: Microscope, keywords: ['b.tech', 'mba', 'weekly report', 'guide'] },
      ],
    },
    {
      title: 'Research & Duties',
      items: [
        { label: 'Library OPAC', href: '/faculty/library', icon: Library, keywords: ['books', 'catalog', 'hold', 'borrow'] },
        { label: 'Exam Invigilation Duty', href: '/faculty/invigilation', icon: Eye, keywords: ['exam cell', 'room', 'supervisor'] },
        { label: 'Re-evaluation Reassessment', href: '/faculty/re-evaluations', icon: FileText, keywords: ['exam cell', 'recheck', 'marks'] },
        { label: 'Research & Publications', href: '/faculty/research', icon: FlaskConical, keywords: ['scopus', 'patent', 'journal', 'pms'] },
      ],
    },
    {
      title: 'Administration',
      items: [
        { label: 'Pending Approvals (Inbox)', href: '/faculty/inbox', icon: Inbox, keywords: ['approve', 'hod', 'pending on me', 'team', 'leave'] },
        { label: 'Falcon Core Tasks (IQAC)', href: '/faculty/iqac', icon: ListChecks, keywords: ['iqac', 'upload', 'tasks'] },
        { label: 'Event Approvals', href: '/faculty/event-approvals', icon: ClipboardPen, keywords: ['club', 'events', 'coordinator'] },
        { label: 'Meetings', href: '/faculty/meetings', icon: CalendarClock, keywords: ['schedule', 'hod', 'minutes', 'agenda'] },
      ],
    },
    myHrOperationsNavGroup('faculty'),
  ],
  commandItems: flattenNavToCommandItems([
    {
      title: 'Home',
      items: [{ label: 'Dashboard', href: '/faculty/dashboard', icon: LayoutDashboard }],
    },
    {
      title: 'Academics & Teaching',
      items: [
        { label: 'Timetable & Extra Classes', href: '/faculty/timetable', icon: CalendarClock, keywords: ['schedule', 'substitute', 'cancel', 'ltp', 'extra'] },
        { label: 'Mark Attendance', href: '/faculty/attendance', icon: ClipboardCheck, keywords: ['attendance', 'present', 'absent'] },
        { label: 'Course Page & Syllabus', href: '/faculty/courses', icon: BookOpen, keywords: ['lesson plan', 'handout', 'materials', 'ppt', 'da', 'digital assignment', 'submission', 'deadline'] },
        { label: 'Examinations & Grading', href: '/faculty/grading', icon: PenLine, keywords: ['marks', 'cat', 'fat', 'quiz'] },
        { label: 'CO-PO Mapping', href: '/faculty/grading/copo', icon: GraduationCap, keywords: ['nba', 'naac', 'outcomes', 'co', 'po'] },
        { label: 'Student Analytics', href: '/faculty/analytics', icon: LineChart, keywords: ['slow learners', 'remedial', 'attendance'] },
        { label: 'Digital Class Logbook', href: '/faculty/logbook', icon: NotebookPen, keywords: ['lecture', 'topic', 'log'] },
      ],
    },
    {
      title: 'Students & Mentoring',
      items: [
        { label: 'Mentorship & Approvals', href: '/faculty/mentorship', icon: Handshake, keywords: ['mentor', 'mentee', 'certificates'] },
        { label: 'Project & Lab Guides', href: '/faculty/projects', icon: Microscope, keywords: ['b.tech', 'mba', 'weekly report', 'guide'] },
      ],
    },
    {
      title: 'Research & Duties',
      items: [
        { label: 'Library OPAC', href: '/faculty/library', icon: Library, keywords: ['books', 'catalog', 'hold', 'borrow'] },
        { label: 'Exam Invigilation Duty', href: '/faculty/invigilation', icon: Eye, keywords: ['exam cell', 'room', 'supervisor'] },
        { label: 'Re-evaluation Reassessment', href: '/faculty/re-evaluations', icon: FileText, keywords: ['exam cell', 'recheck', 'marks'] },
        { label: 'Research & Publications', href: '/faculty/research', icon: FlaskConical, keywords: ['scopus', 'patent', 'journal', 'pms'] },
      ],
    },
    {
      title: 'Administration',
      items: [
        { label: 'Pending Approvals (Inbox)', href: '/faculty/inbox', icon: Inbox, keywords: ['approve', 'hod', 'pending on me', 'team'] },
        { label: 'Falcon Core Tasks (IQAC)', href: '/faculty/iqac', icon: ListChecks, keywords: ['iqac', 'upload', 'tasks'] },
        { label: 'Event Approvals', href: '/faculty/event-approvals', icon: ClipboardPen, keywords: ['club', 'events', 'coordinator'] },
        { label: 'Meetings', href: '/faculty/meetings', icon: CalendarClock, keywords: ['schedule', 'hod', 'minutes'] },
      ],
    },
    myHrOperationsNavGroup('faculty'),
  ]),
};

export const hrPortal: PortalConfig = {
  personaLabel: 'HR Operations',
  personaTitle: 'Falcon HRMS',
  homeHref: '/hr/dashboard',
  navGroups: [
    {
      title: 'Home',
      items: [{ label: 'Dashboard', href: '/hr/dashboard', icon: LayoutDashboard, keywords: ['metrics', 'actions'], hrModule: 'dashboard' }],
    },
    {
      title: 'Employee Master',
      items: [
        { label: 'Employee Directory', href: '/hr/directory', icon: Users, keywords: ['staff', '500', 'roster'], hrModule: 'directory' },
        { label: 'KYC & Document Vault', href: '/hr/kyc', icon: FolderLock, keywords: ['pan', 'aadhaar', 'bank', 'encrypted'], hrModule: 'documents' },
      ],
    },
    {
      title: 'Time & Leaves',
      items: [
        { label: 'Attendance & Biometrics', href: '/hr/attendance', icon: Timer, keywords: ['matrix', 'punch', 'late', 'half day'], hrModule: 'attendance' },
        { label: 'Pending on Me', href: '/hr/inbox', icon: Inbox, keywords: ['approve', 'inbox', 'pending', 'workflow'], roles: ['HR', 'HRAdmin', 'Faculty', 'HOD', 'Dean', 'SuperAdmin'] },
        { label: 'Meetings', href: '/hr/meetings', icon: CalendarClock, keywords: ['schedule', 'minutes', 'agenda'] },
        { label: 'Leave Management & Balances', href: '/hr/leaves', icon: CalendarDays, keywords: ['cl', 'sl', 'el', 'maternity', 'approval'], hrModule: 'leaves' },
      ],
    },
    {
      title: 'Payroll & Finance',
      items: [
        { label: 'Salary Structures', href: '/hr/payroll/structures', icon: Wallet, keywords: ['basic', 'hra', 'da', 'pf', 'tds'], hrModule: 'payroll' },
        { label: 'Payroll Processing', href: '/hr/payroll/processing', icon: Banknote, keywords: ['run payroll', 'payslip', 'lwp'], hrModule: 'payroll' },
      ],
    },
    {
      title: 'Grievances & Support',
      items: [
        { label: 'Grievances Escalation', href: '/hr/grievances', icon: AlertTriangle, keywords: ['ticket', 'escalation', 'sla', 'hr', 'payroll', 'grievance'], roles: ['HRAdmin', 'HR', 'SuperAdmin'] },
      ],
    },
    {
      title: 'Performance & Lifecycle',
      items: [
        { label: 'Onboarding Pipeline', href: '/hr/onboarding', icon: Kanban, keywords: ['kanban', 'hired', 'new hire'], hrModule: 'onboarding' },
        { label: 'First-Login Verifications', href: '/hr/verifications', icon: FileCheck2, keywords: ['faculty', 'hod', 'documents', 'approve'], hrModule: 'onboarding' },
        { label: 'Offboarding & Exit', href: '/hr/offboarding', icon: DoorOpen, keywords: ['resignation', 'fnf', 'separation'], hrModule: 'offboarding' },
        { label: 'Recruitment (ATS)', href: '/hr/recruitment', icon: Briefcase, keywords: ['kanban', 'hired', 'interview'], hrModule: 'recruitment' },
        { label: 'Appraisals & API Scores', href: '/hr/appraisals', icon: Award, keywords: ['ugc', 'api', 'scopus', 'research'], hrModule: 'directory' },
        { label: 'Promotions & Workflows', href: '/hr/promotions', icon: ArrowUpCircle, keywords: ['associate prof', 'professor', 'eligible'], hrModule: 'directory' },
      ],
    },
    {
      title: 'Administration',
      items: [
        { label: 'Access Control Matrix', href: '/hr/admin/permissions', icon: Shield, keywords: ['access', 'roles', 'matrix', 'delegate', 'approve', 'permissions'], roles: ['HRAdmin', 'SuperAdmin'] },
        { label: 'Attendance Rules Engine', href: '/hr/admin/rules', icon: Settings, keywords: ['grace', 'penalty', 'shifts'], roles: ['HRAdmin', 'SuperAdmin'] },
        { label: 'Org Structure', href: '/hr/admin/org-structure', icon: Network, keywords: ['zone', 'branch', 'department'], roles: ['HRAdmin', 'SuperAdmin'] },
        { label: 'Leave Policies', href: '/hr/admin/leave-policies', icon: CalendarDays, keywords: ['clubbing', 'sandwich', 'accrual'], roles: ['HRAdmin', 'SuperAdmin'] },
        { label: 'Approval Workflows', href: '/hr/admin/workflows', icon: ListChecks, keywords: ['approver', 'chain', 'resignation'], roles: ['HRAdmin', 'SuperAdmin'] },
        { label: 'Checklist Templates', href: '/hr/admin/checklist-templates', icon: ClipboardList, keywords: ['onboarding', 'offboarding', 'tasks'], roles: ['HRAdmin', 'SuperAdmin'] },
        { label: 'Company Policies', href: '/hr/policies', icon: FileText, keywords: ['posh', 'leave policy', 'cms'], hrModule: 'policies' },
        { label: 'Analytics & Reports', href: '/hr/reports', icon: FileSpreadsheet, keywords: ['export', 'muster', 'ugc', 'naac', 'excel'], hrModule: 'reports' },
        { label: 'Bulk Document Export', href: '/hr/reports/documents', icon: Archive, keywords: ['zip', 'aadhaar', 'vault', 'bulk'], hrModule: 'reports' },
      ],
    },
    myHrOperationsNavGroup('hr'),
  ],
  commandItems: [
    { label: 'HR Dashboard', href: '/hr/dashboard', icon: LayoutDashboard, hrModule: 'dashboard' },
    { label: 'Employee Directory', href: '/hr/directory', icon: Users, hrModule: 'directory' },
    { label: 'KYC Vault', href: '/hr/kyc', icon: FolderLock, hrModule: 'documents' },
    { label: 'Attendance & Biometrics', href: '/hr/attendance', icon: Timer, hrModule: 'attendance' },
    { label: 'Leave Management', href: '/hr/leaves', icon: CalendarDays, hrModule: 'leaves' },
    { label: 'Salary Structures', href: '/hr/payroll/structures', icon: Wallet, hrModule: 'payroll' },
    { label: 'Payroll Processing', href: '/hr/payroll/processing', icon: Banknote, hrModule: 'payroll' },
    { label: 'Recruitment ATS', href: '/hr/recruitment', icon: Briefcase, hrModule: 'recruitment' },
    { label: 'Appraisals & API', href: '/hr/appraisals', icon: Award, hrModule: 'directory' },
    { label: 'Promotions', href: '/hr/promotions', icon: ArrowUpCircle, hrModule: 'directory' },
    { label: 'Onboarding', href: '/hr/onboarding', icon: Kanban, hrModule: 'onboarding' },
    { label: 'Offboarding', href: '/hr/offboarding', icon: DoorOpen, hrModule: 'offboarding' },
    { label: 'Analytics & Reports', href: '/hr/reports', icon: FileSpreadsheet, hrModule: 'reports' },
    { label: 'Bulk Document Export', href: '/hr/reports/documents', icon: Archive, hrModule: 'reports' },
    { label: 'Access Control', href: '/hr/admin/permissions', icon: Shield, roles: ['HRAdmin', 'SuperAdmin'] },
    { label: 'Attendance Rules', href: '/hr/admin/rules', icon: Settings, roles: ['HRAdmin', 'SuperAdmin'] },
    ...myHrOperationsNavGroup('hr').items,
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
        { label: 'Dashboard', href: '/hod/dashboard', icon: LayoutDashboard, keywords: ['command center', 'metrics', 'attendance'] },
        { label: 'Department Timetable', href: '/hod/department-timetable', icon: CalendarClock, keywords: ['schedule', 'rooms', 'master'] },
      ],
    },
    {
      title: 'Academic Management',
      items: [
        { label: 'Course Allocation', href: '/hod/academics/course-allocation', icon: BookOpen, keywords: ['assign', 'faculty', 'subjects', 'semester'] },
        { label: 'Syllabus & Lesson Tracking', href: '/hod/academics/syllabus-tracking', icon: ListChecks, keywords: ['lms', 'modules', 'coverage', 'units'] },
        { label: 'Result Analytics', href: '/hod/academics/result-analytics', icon: BarChart3, keywords: ['pass', 'fail', 'exam', 'grades'] },
      ],
    },
    {
      title: 'Faculty & Staff',
      items: [
        { label: 'Faculty Roster & Workload', href: '/hod/faculty/workload', icon: Users, keywords: ['hours', 'burnout', 'teaching load'] },
        { label: 'Pending Approvals (Inbox)', href: '/hod/inbox', icon: Inbox, keywords: ['cl', 'sl', 'od', 'approve', 'regularisation'] },
        { label: 'Event Approvals', href: '/hod/events', icon: PartyPopper, keywords: ['club', 'campus events', 'coordinator'] },
        { label: 'Meetings', href: '/hod/meetings', icon: CalendarClock, keywords: ['schedule', 'faculty', 'dean', 'minutes'] },
        { label: 'Appraisals & API Scores', href: '/hod/faculty/appraisals', icon: Award, keywords: ['research', 'hod rating', 'api', 'pms'] },
      ],
    },
    {
      title: 'Student Affairs',
      items: [
        { label: 'Student Monitor', href: '/hod/student-monitor', icon: GraduationCap, keywords: ['students', 'branch', 'filter'] },
        { label: 'Defaulters & Slow Learners', href: '/hod/students/defaulters', icon: LineChart, keywords: ['attendance', 'grades', 'remedial'] },
        { label: 'Grievance Escalations', href: '/hod/students/grievances', icon: LifeBuoy, keywords: ['academic', 'ticket', 'escalation'] },
      ],
    },
    myHrOperationsNavGroup('hod'),
  ],
  commandItems: flattenNavToCommandItems([
    {
      title: 'Department Health',
      items: [
        { label: 'Dashboard', href: '/hod/dashboard', icon: LayoutDashboard, keywords: ['command center', 'metrics'] },
        { label: 'Department Timetable', href: '/hod/department-timetable', icon: CalendarClock, keywords: ['schedule'] },
      ],
    },
    {
      title: 'Academic Management',
      items: [
        { label: 'Course Allocation', href: '/hod/academics/course-allocation', icon: BookOpen, keywords: ['assign faculty'] },
        { label: 'Syllabus & Lesson Tracking', href: '/hod/academics/syllabus-tracking', icon: ListChecks, keywords: ['lms'] },
        { label: 'Result Analytics', href: '/hod/academics/result-analytics', icon: BarChart3, keywords: ['pass fail'] },
      ],
    },
    {
      title: 'Faculty & Staff',
      items: [
        { label: 'Faculty Roster & Workload', href: '/hod/faculty/workload', icon: Users, keywords: ['workload'] },
        { label: 'Pending Approvals (Inbox)', href: '/hod/inbox', icon: Inbox, keywords: ['approve'] },
        { label: 'Event Approvals', href: '/hod/events', icon: PartyPopper, keywords: ['club events'] },
        { label: 'Meetings', href: '/hod/meetings', icon: CalendarClock, keywords: ['schedule', 'faculty'] },
        { label: 'Appraisals & API Scores', href: '/hod/faculty/appraisals', icon: Award, keywords: ['api'] },
      ],
    },
    {
      title: 'Student Affairs',
      items: [
        { label: 'Student Monitor', href: '/hod/student-monitor', icon: GraduationCap, keywords: ['students'] },
        { label: 'Defaulters & Slow Learners', href: '/hod/students/defaulters', icon: LineChart, keywords: ['defaulters'] },
        { label: 'Grievance Escalations', href: '/hod/students/grievances', icon: LifeBuoy, keywords: ['grievance'] },
      ],
    },
    myHrOperationsNavGroup('hod'),
  ]),
};

export const deanPortal: PortalConfig = {
  personaLabel: 'Dean Workspace',
  personaTitle: 'School Command Center',
  homeHref: '/dean/dashboard',
  navGroups: [
    {
      title: 'School Health',
      items: [
        { label: 'Dashboard', href: '/dean/dashboard', icon: LayoutDashboard, keywords: ['command center', 'metrics', 'school'] },
        { label: 'Departments', href: '/dean/departments', icon: Building2, keywords: ['hod', 'oversight', 'departments'] },
        { label: 'School Timetable', href: '/dean/academics/timetable', icon: CalendarClock, keywords: ['schedule', 'cross-department'] },
      ],
    },
    {
      title: 'Academic Quality',
      items: [
        { label: 'Course Allocation Review', href: '/dean/academics/course-allocation', icon: BookOpen, keywords: ['assign', 'faculty', 'review'] },
        { label: 'Syllabus Tracking', href: '/dean/academics/syllabus-tracking', icon: ListChecks, keywords: ['lms', 'coverage'] },
        { label: 'Result Analytics', href: '/dean/academics/result-analytics', icon: BarChart3, keywords: ['pass', 'fail', 'grades'] },
      ],
    },
    {
      title: 'Faculty & HODs',
      items: [
        { label: 'Faculty Workload', href: '/dean/faculty/workload', icon: Users, keywords: ['hours', 'teaching load'] },
        { label: 'Appraisals & API', href: '/dean/faculty/appraisals', icon: Award, keywords: ['research', 'api', 'pms'] },
      ],
    },
    {
      title: 'Student Affairs',
      items: [
        { label: 'Student Monitor', href: '/dean/students/monitor', icon: GraduationCap, keywords: ['students', 'risk'] },
        { label: 'Defaulters', href: '/dean/students/defaulters', icon: LineChart, keywords: ['attendance', 'grades'] },
        { label: 'Grievances', href: '/dean/students/grievances', icon: LifeBuoy, keywords: ['escalation', 'ticket'] },
      ],
    },
    {
      title: 'Approvals',
      items: [
        { label: 'Dean Inbox', href: '/dean/inbox', icon: Inbox, keywords: ['approve', 'escalation'] },
        { label: 'Event Approvals', href: '/dean/events', icon: PartyPopper, keywords: ['club', 'campus events'] },
        { label: 'Meetings', href: '/dean/meetings', icon: CalendarClock, keywords: ['schedule', 'hod', 'faculty', 'minutes'] },
      ],
    },
    myHrOperationsNavGroup('dean'),
  ],
  commandItems: flattenNavToCommandItems([
    {
      title: 'School Health',
      items: [
        { label: 'Dashboard', href: '/dean/dashboard', icon: LayoutDashboard, keywords: ['command center'] },
        { label: 'Departments', href: '/dean/departments', icon: Building2, keywords: ['departments'] },
        { label: 'School Timetable', href: '/dean/academics/timetable', icon: CalendarClock, keywords: ['timetable'] },
      ],
    },
    {
      title: 'Academic Quality',
      items: [
        { label: 'Course Allocation Review', href: '/dean/academics/course-allocation', icon: BookOpen, keywords: ['allocation'] },
        { label: 'Syllabus Tracking', href: '/dean/academics/syllabus-tracking', icon: ListChecks, keywords: ['syllabus'] },
        { label: 'Result Analytics', href: '/dean/academics/result-analytics', icon: BarChart3, keywords: ['results'] },
      ],
    },
    {
      title: 'Faculty & HODs',
      items: [
        { label: 'Faculty Workload', href: '/dean/faculty/workload', icon: Users, keywords: ['workload'] },
        { label: 'Appraisals & API', href: '/dean/faculty/appraisals', icon: Award, keywords: ['appraisals'] },
      ],
    },
    {
      title: 'Student Affairs',
      items: [
        { label: 'Student Monitor', href: '/dean/students/monitor', icon: GraduationCap, keywords: ['students'] },
        { label: 'Defaulters', href: '/dean/students/defaulters', icon: LineChart, keywords: ['defaulters'] },
        { label: 'Grievances', href: '/dean/students/grievances', icon: LifeBuoy, keywords: ['grievances'] },
      ],
    },
    {
      title: 'Approvals',
      items: [
        { label: 'Dean Inbox', href: '/dean/inbox', icon: Inbox, keywords: ['inbox'] },
        { label: 'Event Approvals', href: '/dean/events', icon: PartyPopper, keywords: ['events'] },
        { label: 'Meetings', href: '/dean/meetings', icon: CalendarClock, keywords: ['schedule', 'minutes'] },
      ],
    },
    myHrOperationsNavGroup('dean'),
  ]),
};

export const hostelAdminPortal: PortalConfig = {
  personaLabel: 'Hostel Administration',
  personaTitle: 'Residential Operations',
  homeHref: '/hostel-admin/dashboard',
  navGroups: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/hostel-admin/dashboard', icon: LayoutDashboard, keywords: ['metrics', 'occupancy'] },
        { label: 'Hostel Management', href: '/hostel-admin/hostels', icon: Building2, keywords: ['rooms', 'beds', 'facilities'] },
        { label: 'Student Management', href: '/hostel-admin/students', icon: Users, keywords: ['allocation', 'transfer', 'evict'] },
      ],
    },
    {
      title: 'Daily Operations',
      items: [
        { label: 'Attendance (Roll Call)', href: '/hostel-admin/attendance', icon: CalendarDays, keywords: ['curfew', 'present', 'absent'] },
        { label: 'Leave & Gate Passes', href: '/hostel-admin/gate-passes', icon: ClipboardCheck, keywords: ['approve', 'checkout'] },
        { label: 'Visitor Management', href: '/hostel-admin/visitors', icon: Shield, keywords: ['entry', 'exit', 'qr'] },
      ],
    },
    {
      title: 'Services',
      items: [
        { label: 'Fines & Damages', href: '/hostel-admin/tickets', icon: Ticket, keywords: ['damage', 'maintenance'] },
        { label: 'Mess Management', href: '/hostel-admin/mess', icon: UtensilsCrossed, keywords: ['menu', 'weekly'] },
        { label: 'Grievance Escalations', href: '/hostel-admin/grievances', icon: LifeBuoy, keywords: ['maintenance', 'ticket', 'escalation'] },
        { label: 'Notifications', href: '/hostel-admin/notifications', icon: Bell, keywords: ['broadcast', 'sms', 'email'] },
        { label: 'Mess Scanner', href: '/hostel-admin/scanner', icon: QrCode, keywords: ['wallet', 'meal'] },
      ],
    },
    {
      title: 'Configuration',
      items: [
        { label: 'System & Master Data', href: '/hostel-admin/settings', icon: Settings, keywords: ['room types', 'permissions'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Hostel Dashboard', href: '/hostel-admin/dashboard', icon: LayoutDashboard },
    { label: 'Hostel Management', href: '/hostel-admin/hostels', icon: Building2 },
    { label: 'Students', href: '/hostel-admin/students', icon: Users },
    { label: 'Roll Call', href: '/hostel-admin/attendance', icon: CalendarDays },
    { label: 'Gate Passes', href: '/hostel-admin/gate-passes', icon: ClipboardCheck },
    { label: 'Visitors', href: '/hostel-admin/visitors', icon: Shield },
    { label: 'Tickets & Fines', href: '/hostel-admin/tickets', icon: Ticket },
    { label: 'Mess Menu', href: '/hostel-admin/mess', icon: UtensilsCrossed },
    { label: 'Notifications', href: '/hostel-admin/notifications', icon: Bell },
    { label: 'Master Data', href: '/hostel-admin/settings', icon: Settings },
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
        { label: 'Enrolled Students Payment status', href: '/finance/enrolled-students', icon: Users, keywords: ['receipts', 'fee', 'payment', 'students'] },
        { label: 'Grievance Escalations', href: '/finance/grievances', icon: LifeBuoy, keywords: ['finance', 'ticket', 'escalation'] },
        { label: 'Club Event Fund Transfers', href: '/finance/events', icon: Ticket, keywords: ['events', 'clubs', 'transfer', 'funds'] },
        { label: 'Scholarships & Waivers', href: '/finance/scholarships', icon: Award, keywords: ['discount', 'waiver'] },
      ],
    },
    {
      title: 'Payables & Expenses',
      items: [
        { label: 'Vendor Master', href: '/finance/vendors', icon: Building2, keywords: ['gstin', 'tds', 'supplier'] },
        { label: 'Expense Heads & Bills', href: '/finance/expenses', icon: Receipt, keywords: ['gst', 'invoice', 'maintenance'] },
        { label: 'Project Funding Requests', href: '/finance/funding-requests', icon: Receipt, keywords: ['project', 'funding', 'hod', 'faculty'] },
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
    { label: 'Project Funding Requests', href: '/finance/funding-requests', icon: Receipt },
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
  personaLabel: 'Falcon Library',
  personaTitle: 'Catalog & Circulation (Koha replacement)',
  homeHref: '/library/dashboard',
  navGroups: [
    {
      title: 'Library Operations',
      items: [
        { label: 'Library Dashboard', href: '/library/dashboard', icon: LayoutDashboard, keywords: ['metrics', 'issued', 'overdue'] },
        { label: 'Circulation Desk', href: '/library/circulation', icon: Users, keywords: ['issue', 'return', 'scanner', 'barcode'] },
        { label: 'Cataloging & Inventory', href: '/library/catalog', icon: ClipboardList, keywords: ['isbn', 'auto-fetch'] },
        { label: 'Defaulters & Fines', href: '/library/fines', icon: Banknote, keywords: ['finance', 'overdue'] },
        { label: 'NAAC Reports', href: '/library/reports', icon: FileText, keywords: ['utilization', 'export', 'naac'] },
        { label: 'Gate Register', href: '/library/gate', icon: DoorOpen, keywords: ['walk-in', 'ipad'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Dashboard', href: '/library/dashboard', icon: LayoutDashboard },
    { label: 'Circulation', href: '/library/circulation', icon: Users },
    { label: 'Cataloging', href: '/library/catalog', icon: ClipboardList },
    { label: 'Fines', href: '/library/fines', icon: Banknote },
    { label: 'NAAC Reports', href: '/library/reports', icon: FileText },
  ],
};

export const parentPortal: PortalConfig = {
  personaLabel: 'Parent Portal',
  personaTitle: 'Student Guardian View',
  homeHref: '/parent/dashboard',
  navGroups: [
    {
      title: 'Guardian App',
      items: [
        { label: 'Home', href: '/parent/dashboard', icon: LayoutDashboard, keywords: ['feed', 'child', 'overview'] },
        { label: 'Academics', href: '/parent/academics', icon: GraduationCap, keywords: ['marks', 'sgpa', 'proctor'] },
        { label: 'Finance', href: '/parent/finance', icon: Wallet, keywords: ['dues', 'fees', '80c', 'tax'] },
        { label: 'Tracking', href: '/parent/tracking', icon: MapPin, keywords: ['hostel', 'bus', 'safety'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Home', href: '/parent/dashboard', icon: LayoutDashboard },
    { label: 'Academics', href: '/parent/academics', icon: GraduationCap },
    { label: 'Finance', href: '/parent/finance', icon: Wallet },
    { label: 'Tracking', href: '/parent/tracking', icon: MapPin },
  ],
};

export const examCellPortal: PortalConfig = {
  personaLabel: 'Falcon Exam OS',
  personaTitle: 'Controller of Examinations',
  homeHref: '/exam-cell/dashboard',
  navGroups: [
    {
      title: 'Pre-Exam Operations',
      items: [
        { label: 'Command Center', href: '/exam-cell/dashboard', icon: LayoutDashboard, keywords: ['coe', 'exam cell'] },
        { label: 'Master Exam Schedule', href: '/exam-cell/schedule', icon: CalendarDays, keywords: ['mid term', 'end term'] },
        { label: 'Admit Card Engine', href: '/exam-cell/admit-cards', icon: Ticket, keywords: ['hall ticket', 'admit'] },
        { label: 'Seating Planner', href: '/exam-cell/seating', icon: ClipboardList, keywords: ['seating', 'rooms'] },
        { label: 'Invigilation Roster', href: '/exam-cell/invigilation', icon: Eye, keywords: ['faculty', 'duty'] },
      ],
    },
    {
      title: 'Post-Exam Operations',
      items: [
        { label: 'Result Control Centre', href: '/exam-cell/results', icon: TrendingUp, keywords: ['publish', 'bell curve', 'declare', 'marks entry'] },
        { label: 'Course Grades', href: '/exam-cell/course-grades', icon: GraduationCap, keywords: ['grades', 'aggregate'] },
        { label: 'Re-evaluations', href: '/exam-cell/re-evaluations', icon: FileText, keywords: ['recheck', 'backlog'] },
        { label: 'UFM Malpractice Desk', href: '/exam-cell/ufm-cases', icon: Shield, keywords: ['cheating', 'unfair means'] },
        { label: 'Degree & Transcripts', href: '/exam-cell/transcripts', icon: Award, keywords: ['digilocker', 'abc id'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Exam OS Dashboard', href: '/exam-cell/dashboard', icon: LayoutDashboard },
    { label: 'Exam Schedule', href: '/exam-cell/schedule', icon: CalendarDays },
    { label: 'Admit Cards', href: '/exam-cell/admit-cards', icon: Ticket },
    { label: 'Publish Results', href: '/exam-cell/results', icon: TrendingUp },
    { label: 'UFM Desk', href: '/exam-cell/ufm-cases', icon: Shield },
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
        { label: 'Grievances Escalation', href: '/president/issues', icon: AlertTriangle, keywords: ['grievance', 'sla', 'compliance'] },
        { label: 'Meetings', href: '/president/meetings', icon: CalendarClock, keywords: ['schedule', 'minutes', 'agenda'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Executive Summary', href: '/president/executive-summary', icon: LayoutDashboard },
    { label: 'Meetings', href: '/president/meetings', icon: CalendarClock },
    { label: 'Academics', href: '/president/academics', icon: GraduationCap },
    { label: 'Finance', href: '/president/finance', icon: Wallet },
    { label: 'Compliance', href: '/president/compliance', icon: Shield },
    { label: 'HR Analytics', href: '/president/hr-analytics', icon: Users },
    { label: 'Grievances Escalation', href: '/president/issues', icon: AlertTriangle },
  ],
};

export const leadershipPortal: PortalConfig = {
  personaLabel: 'Chairman / Executive Board',
  personaTitle: 'Owner’s Command Center',
  homeHref: '/leadership/overview',
  navGroups: [
    {
      title: 'Global Command Center',
      items: [
        { label: 'Automated Insights', href: '/leadership/intelligence', icon: LineChart, keywords: ['owners brief', 'ticker', 'ai', 'alerts'] },
        { label: 'Versus · Comparative Analytics', href: '/leadership/versus', icon: LineChart, keywords: ['mom', 'yoy', 'variance', 'scatter', 'ratios'] },
        { label: 'Finance Config', href: '/leadership/finance-config', icon: Settings, keywords: ['allocation rules', 'bank snapshot', 'waterfall'] },
        { label: 'Budget Allocation', href: '/leadership/budget-allocation', icon: Banknote, keywords: ['fpa', 'allocate', 'financial year', 'department'] },
        { label: 'Budget Monitor', href: '/leadership/budget-monitor', icon: BarChart3, keywords: ['sankey', 'drill-down', 'encumbrance', 'program'] },
        { label: 'Overview', href: '/leadership/overview', icon: LayoutDashboard, keywords: ['tickers', 'students', 'revenue', 'attendance'] },
        { label: 'Pillar 1 · Financial P&L + Cash Flow', href: '/leadership/finance', icon: Wallet, keywords: ['sankey', 'waterfall', 'p&l', 'cash flow'] },
        { label: 'Pillar 2 · Admissions Funnel', href: '/leadership/admissions-funnel', icon: TrendingUp, keywords: ['leads', 'applications', 'enrolled', 'conversion'] },
        { label: 'Pillar 3 · Academic & Brand Value', href: '/leadership/academics', icon: GraduationCap, keywords: ['placements heatmap', 'naac', 'iqac', 'faculty phd'] },
        { label: 'Pillar 4 · HR & Payroll Economics', href: '/leadership/hr-ops', icon: Users, keywords: ['payroll', 'attrition', 'cost vs revenue'] },
        { label: 'Pillar 5 · Infrastructure & Assets', href: '/leadership/infrastructure', icon: Building2, keywords: ['hostel occupancy', 'assets', 'maintenance'] },
        { label: 'Pillar 6 · Grievances Escalation', href: '/leadership/issues', icon: AlertTriangle, keywords: ['grievance', 'sla', 'compliance'] },
        { label: 'University Directory', href: '/directory', icon: Contact, keywords: ['students', 'faculty', 'browse', 'export', '360'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Automated Insights', href: '/leadership/intelligence', icon: LineChart },
    { label: 'Versus', href: '/leadership/versus', icon: LineChart },
    { label: 'Finance Config', href: '/leadership/finance-config', icon: Settings },
    { label: 'Budget Allocation', href: '/leadership/budget-allocation', icon: Banknote },
    { label: 'Budget Monitor', href: '/leadership/budget-monitor', icon: BarChart3 },
    { label: 'Executive Overview', href: '/leadership/overview', icon: LayoutDashboard },
    { label: 'Cash Flow', href: '/leadership/finance', icon: Wallet },
    { label: 'Admissions Funnel', href: '/leadership/admissions-funnel', icon: TrendingUp },
    { label: 'Academics', href: '/leadership/academics', icon: GraduationCap },
    { label: 'Placements', href: '/leadership/placements', icon: Briefcase },
    { label: 'HR Economics', href: '/leadership/hr-ops', icon: Users },
    { label: 'Infrastructure', href: '/leadership/infrastructure', icon: Building2 },
    { label: 'Grievances Escalation', href: '/leadership/issues', icon: AlertTriangle },
    { label: 'University Directory', href: '/directory', icon: Contact },
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
        { label: 'Transport Hub', href: '/admin-ops/transport', icon: BusFront },
        { label: 'Master Academic Calendar', href: '/admin-ops/calendar', icon: Calendar },
        { label: 'Event Venue Approvals', href: '/admin-ops/events', icon: Ticket },
        { label: 'Master Timetable', href: '/admin-ops/timetable', icon: CalendarClock },
        { label: 'Timetable Builder', href: '/admin-ops/timetable-builder', icon: CalendarClock, keywords: ['clash', 'scheduling', 'rooms'] },
        { label: 'University Directory', href: '/directory', icon: Contact, keywords: ['students', 'faculty', 'browse', 'export'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Assets', href: '/admin-ops/assets', icon: Archive },
    { label: 'Fleet', href: '/admin-ops/fleet', icon: Bus },
    { label: 'Timetable', href: '/admin-ops/timetable', icon: CalendarClock },
    { label: 'University Directory', href: '/directory', icon: Contact },
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
        { label: 'Placement Drives & ATS', href: '/placements/drives', icon: Kanban },
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

/** Alumni Officer portal — conversion verifications, donations, events. */
export const alumniAdminPortal: PortalConfig = {
  personaLabel: 'Alumni Relations',
  personaTitle: 'Alumni Admin Portal',
  homeHref: '/alumni-admin/verification',
  navGroups: [
    {
      title: 'Conversion Workflow',
      items: [
        {
          label: 'Pending Verifications',
          href: '/alumni-admin/verification',
          icon: CheckCircle,
          keywords: ['approve', 'no-dues', 'graduate', 'alumni'],
        },
      ],
    },
    {
      title: 'Engagement',
      items: [
        { label: 'Donation Ledger', href: '/alumni-admin/donations', icon: DollarSign, keywords: ['80g', 'endowment'] },
        { label: 'Engagement Analytics', href: '/alumni-admin/analytics', icon: BarChart3, keywords: ['retention', 'mentorship'] },
        { label: 'Event Manager', href: '/alumni-admin/events', icon: Calendar, keywords: ['rsvp', 'reunion'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Pending Verifications', href: '/alumni-admin/verification', icon: CheckCircle },
    { label: 'Donation Ledger', href: '/alumni-admin/donations', icon: DollarSign },
    { label: 'Analytics', href: '/alumni-admin/analytics', icon: BarChart3 },
    { label: 'Events', href: '/alumni-admin/events', icon: Calendar },
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
        { label: 'Student Verifications', href: '/admin/verifications', icon: FileCheck2, roles: ['SuperAdmin', 'AdmissionsOfficer', 'Registrar'] },
        { label: 'Academics', href: '/admin/academics', icon: GraduationCap, roles: ['SuperAdmin', 'Registrar'] },
        { label: 'Finance', href: '/admin/finance', icon: Wallet, roles: ['SuperAdmin', 'Accountant', 'President'] },
        { label: 'HR & Payroll', href: '/admin/hr', icon: Users, roles: ['SuperAdmin', 'HR', 'President'] },
        { label: 'IQAC & Placements', href: '/admin/iqac', icon: BarChart3, roles: ['SuperAdmin', 'IQAC', 'PlacementCell', 'President'] },
        { label: 'Operations', href: '/admin/operations', icon: Bus, roles: ['SuperAdmin', 'Warden', 'Librarian', 'TransportOfficer'] },
        { label: 'Settings & IT', href: '/admin/settings', icon: Settings, roles: ['SuperAdmin'] },
        { label: 'University Directory', href: '/directory', icon: Contact, roles: ['SuperAdmin', 'Registrar', 'President'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Admissions Kanban', href: '/admin/admissions', icon: Kanban, roles: ['SuperAdmin', 'AdmissionsOfficer'] },
    { label: 'Pending Approvals', href: '/admin/dashboard', icon: ListChecks },
    { label: 'University Directory', href: '/directory', icon: Contact },
    { label: 'Export Reports', href: '/admin/dashboard', icon: BarChart3, roles: ['SuperAdmin', 'President', 'IQAC'] },
  ],
};
