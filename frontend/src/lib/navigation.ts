import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  LayoutGrid,
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
  PieChart,
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
  Upload,
  Scale,
  Heart,
  Calendar,
  CheckCircle,
  DollarSign,
  Download,
  Network,
  Building2,
  Receipt,
  Landmark,
  BookMarked,
  FileSpreadsheet,
  Ticket,
  Search,
  Printer,
  ListTodo,
  UtensilsCrossed,
  Bell,
  History,
  QrCode,
  BedDouble,
  PartyPopper,
  Rocket,
  ClipboardPen,
  MapPin,
  AlertTriangle,
  Contact,
  Megaphone,
  CheckSquare,
  ScrollText,
  FileLock,
  Video,
  Target,
} from 'lucide-react';
import { getAccountSettingsHrefForPortal } from '@/lib/auth-routing';
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
  /** When false, skip auto-injected sidebar Account Settings (e.g. if profile menu already links there). */
  includeAccountSettingsNav?: boolean;
}

/**
 * Resolve which nav href should be active for the current path.
 * Prefers the longest matching href so nested routes (e.g. /hr/reports/documents)
 * do not also highlight their parent (/hr/reports).
 */
export function resolveActiveNavHref(
  pathname: string | null | undefined,
  hrefs: Iterable<string>,
): string | null {
  if (!pathname) return null;
  let best: string | null = null;
  for (const href of hrefs) {
    if (!href) continue;
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (!matches) continue;
    if (!best || href.length > best.length) best = href;
  }
  return best;
}

export function isNavHrefActive(
  pathname: string | null | undefined,
  href: string,
  allHrefs: Iterable<string>,
): boolean {
  return resolveActiveNavHref(pathname, allHrefs) === href;
}

export function collectNavHrefs(navGroups: NavGroup[]): string[] {
  return navGroups.flatMap((group) => group.items.map((item) => item.href));
}

function portalPathFromHomeHref(homeHref: string): string {
  const segment = homeHref.split('/').filter(Boolean)[0];
  return segment ? `/${segment}` : homeHref;
}

/** Append account settings to sidebar + command palette when not already linked. */
export function withAccountSettingsNav(config: PortalConfig): PortalConfig {
  if (config.includeAccountSettingsNav === false) return config;

  const settingsHref = getAccountSettingsHrefForPortal(portalPathFromHomeHref(config.homeHref));
  const hasSettings = config.navGroups.some((group) =>
    group.items.some((item) => item.href === settingsHref),
  );
  if (hasSettings) return config;

  const settingsItem: NavItem = {
    label: 'Account Settings',
    href: settingsHref,
    icon: Settings,
    keywords: ['password', 'security', 'notifications', 'email', 'account', 'phone', 'contact', 'address', 'profile'],
    shortLabel: 'Settings',
  };

  const commandHasSettings = config.commandItems.some((item) => item.href === settingsHref);

  return {
    ...config,
    navGroups: [...config.navGroups, { title: 'Account', items: [settingsItem] }],
    commandItems: commandHasSettings ? config.commandItems : [...config.commandItems, settingsItem],
  };
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
      {
        label: 'Account Settings',
        href: p.settings,
        icon: Settings,
        keywords: ['password', 'security', 'notifications', 'email', 'account', 'phone', 'contact', 'address', 'profile'],
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

/** Hide placement coordinator route unless faculty is assigned by HOD. */
export function filterFacultyPortalForPlacementCoordinator(
  config: PortalConfig,
  isCoordinator: boolean,
): PortalConfig {
  const coordHref = '/faculty/placement-coordinator';
  if (isCoordinator) return config;
  const navGroups = config.navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.href !== coordHref),
    }))
    .filter((group) => group.items.length > 0);
  const commandItems = config.commandItems.filter((item) => item.href !== coordHref);
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
        { label: 'Graduation & Alumni', href: '/student/exit', icon: GraduationCap, keywords: ['exit', 'no dues', 'degree', 'convocation', 'alumni', 'graduation', 'certificate'] },
      ],
    },
    {
      title: 'Academics & Examinations',
      items: [
        { label: 'Weekly Timetable', href: '/student/timetable', icon: CalendarDays, keywords: ['timetable', 'schedule', 'classes'] },
        { label: 'Subjects & Registration (CBCS)', href: '/student/registration', icon: BookOpen, keywords: ['cbcs', 'electives', 'credits', 'courses'] },
        { label: 'Course Page & DA', href: '/student/courses', icon: NotebookPen, keywords: ['lesson plan', 'handout', 'materials', 'ppt', 'da', 'digital assignment', 'submission', 'syllabus', 'lms'] },
        { label: 'Attendance & Progression', href: '/student/attendance', icon: ClipboardCheck, keywords: ['attendance', 'semester', 'progression'] },
        { label: 'Weekly Tests', href: '/student/weekly-tests', icon: Timer, keywords: ['wt1', 'wt2', 'weekly test', 'assessment'] },
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
        { label: 'Events & Clubs', href: '/student/falcon-events', icon: PartyPopper, keywords: ['falcon events', 'clubs', 'chapters', 'tickets', 'ncc', 'nss', 'fest', 'membership'], shortLabel: 'Events' },
        { label: 'Venue Booking', href: '/student/venues', icon: Building2, keywords: ['room', 'gd', 'seminar', 'hall', 'classroom', 'booking'] },
        { label: 'E-Cell & Incubation', href: '/student/e-cell', icon: Rocket, keywords: ['startup', 'pitch', 'incubation', 'grant'] },
        { label: 'Research Grants', href: '/student/research', icon: FlaskConical, keywords: ['rnd', 'research', 'grant', 'paper', 'project'] },
        { label: 'Ph.D. Programme', href: '/student/phd', icon: GraduationCap, keywords: ['phd', 'pet', 'doctorate', 'research', 'thesis'] },
      ],
    },
    {
      title: 'Support & Placements',
      items: [
        { label: 'Mentorship', href: '/student/mentorship', icon: Handshake, keywords: ['mentor', 'mentee', 'meeting'] },
        { label: 'Placements & Internships', href: '/student/placements', icon: Briefcase, keywords: ['placement', 'jobs', 'internship'], shortLabel: 'Placements' },
        { label: 'Grievances & Helpdesk', href: '/student/helpdesk', icon: LifeBuoy, keywords: ['tickets', 'discipline', 'grievance'], shortLabel: 'Helpdesk' },
        { label: 'University Policies', href: '/student/policies', icon: Shield, keywords: ['rules', 'policies', 'mandatory', 'vote', 'warden', 'dean'] },
        { label: 'Safety Concerns', href: '/student/safety-concerns', icon: Shield, keywords: ['ragging', 'harassment', 'sexual harassment', 'bullying', 'posh'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard },
    { label: 'My Profile', href: '/student/profile', icon: UserRoundCog },
    { label: 'Admission Vault', href: '/student/admission-vault', icon: Archive },
    { label: 'CBCS Registration', href: '/student/registration', icon: BookOpen },
    { label: 'Course Page & DA', href: '/student/courses', icon: NotebookPen },
    { label: 'Attendance', href: '/student/attendance', icon: ClipboardCheck },
    { label: 'Weekly Tests', href: '/student/weekly-tests', icon: Timer },
    { label: 'Marks', href: '/student/marks', icon: TrendingUp },
    { label: 'Exam Desk', href: '/student/exams', icon: ClipboardList },
    { label: 'Financial Ledger', href: '/student/finance', icon: Wallet },
    { label: 'Campus Life', href: '/student/campus-life', icon: Bus },
    { label: 'Events & Clubs', href: '/student/falcon-events', icon: PartyPopper },
    { label: 'Venue Booking', href: '/student/venues', icon: Building2 },
    { label: 'E-Cell Hub', href: '/student/e-cell', icon: Rocket },
    { label: 'Research Grants', href: '/student/research', icon: FlaskConical },
    { label: 'Ph.D. Programme', href: '/student/phd', icon: GraduationCap },
    { label: 'Graduation & Alumni', href: '/student/exit', icon: GraduationCap },
    { label: 'Helpdesk', href: '/student/helpdesk', icon: LifeBuoy },
    { label: 'University Policies', href: '/student/policies', icon: Shield },
    { label: 'Safety Concerns', href: '/student/safety-concerns', icon: Shield },
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
        { label: 'Schedule Classes', href: '/faculty/schedule-classes', icon: CalendarClock, keywords: ['timetable', 'slots', 'drag and drop'] },
        { label: 'Timetable & Extra Classes', href: '/faculty/timetable', icon: CalendarClock, keywords: ['schedule', 'substitute', 'cancel', 'ltp'] },
        { label: 'Mark Attendance', href: '/faculty/attendance', icon: ClipboardCheck, keywords: ['attendance', 'present', 'absent'] },
        { label: 'Course Page & DA', href: '/faculty/courses', icon: BookOpen, keywords: ['lesson plan', 'handout', 'materials', 'ppt', 'da', 'digital assignment', 'submission', 'deadline'] },
        { label: 'Weekly Tests Configuration', href: '/faculty/weekly-tests', icon: Timer, keywords: ['wt1', 'wt2', 'weekly test', 'assessment', 'create test'] },
        { label: 'Examinations & Grading', href: '/faculty/grading', icon: PenLine, keywords: ['marks', 'cat', 'fat', 'quiz'] },
        { label: 'Student Analytics', href: '/faculty/analytics', icon: LineChart, keywords: ['slow learners', 'remedial', 'attendance'] },

      ],
    },
    {
      title: 'Students & Mentoring',
      items: [
        { label: 'Mentorship & Approvals', href: '/faculty/mentorship', icon: Handshake, keywords: ['mentor', 'mentee', 'certificates'] },
        { label: 'Project & Lab Guides', href: '/faculty/projects', icon: Microscope, keywords: ['b.tech', 'mba', 'weekly report', 'guide'] },
        { label: 'Log Disciplinary Incident', href: '/faculty/discipline/incidents', icon: Scale, keywords: ['demerit', 'discipline', 'dc', 'misconduct'] },
        { label: 'Safety Notices', href: '/faculty/safety-notices', icon: Shield, keywords: ['ragging', 'harassment', 'concern', 'notice'] },
      ],
    },
    {
      title: 'Research & Duties',
      items: [
        { label: 'Library OPAC', href: '/faculty/library', icon: Library, keywords: ['books', 'catalog', 'hold', 'borrow'] },
        { label: 'Exam Invigilation Duty', href: '/faculty/invigilation', icon: Eye, keywords: ['exam cell', 'room', 'supervisor'] },
        { label: 'Re-evaluation Reassessment', href: '/faculty/re-evaluations', icon: FileText, keywords: ['exam cell', 'recheck', 'marks'] },
        { label: 'Research & Publications', href: '/faculty/research', icon: FlaskConical, keywords: ['scopus', 'patent', 'journal', 'pms'] },
        { label: 'R&D Grant Approvals', href: '/faculty/research-approvals', icon: Microscope, keywords: ['guide', 'research grant', 'student project'] },
        { label: 'Ph.D. Scholars', href: '/faculty/phd/scholars', icon: GraduationCap, keywords: ['phd', 'guide', 'scholar', 'thesis'] },
      ],
    },
    {
      title: 'Administration',
      items: [
        { label: 'Pending Approvals (Inbox)', href: '/faculty/inbox', icon: Inbox, keywords: ['approve', 'hod', 'pending on me', 'team', 'leave'] },
        { label: 'Falcon Core Tasks (IQAC)', href: '/faculty/iqac', icon: ListChecks, keywords: ['iqac', 'upload', 'tasks'] },
        { label: 'Event Approvals', href: '/faculty/event-approvals', icon: ClipboardPen, keywords: ['club', 'events', 'coordinator'] },
        { label: 'Placement Coordinator', href: '/faculty/placement-coordinator', icon: Briefcase, keywords: ['placement', 'drives', 'coordinator', 'attendance'] },
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
        { label: 'Course Page & DA', href: '/faculty/courses', icon: BookOpen, keywords: ['lesson plan', 'handout', 'materials', 'ppt', 'da', 'digital assignment', 'submission', 'deadline'] },
        { label: 'Weekly Tests Configuration', href: '/faculty/weekly-tests', icon: Timer, keywords: ['wt1', 'wt2', 'weekly test', 'assessment', 'create test'] },
        { label: 'Examinations & Grading', href: '/faculty/grading', icon: PenLine, keywords: ['marks', 'cat', 'fat', 'quiz'] },
        { label: 'Student Analytics', href: '/faculty/analytics', icon: LineChart, keywords: ['slow learners', 'remedial', 'attendance'] },

      ],
    },
    {
      title: 'Students & Mentoring',
      items: [
        { label: 'Mentorship & Approvals', href: '/faculty/mentorship', icon: Handshake, keywords: ['mentor', 'mentee', 'certificates'] },
        { label: 'Project & Lab Guides', href: '/faculty/projects', icon: Microscope, keywords: ['b.tech', 'mba', 'weekly report', 'guide'] },
        { label: 'Log Disciplinary Incident', href: '/faculty/discipline/incidents', icon: Scale, keywords: ['demerit', 'discipline', 'dc', 'misconduct'] },
        { label: 'Safety Notices', href: '/faculty/safety-notices', icon: Shield, keywords: ['ragging', 'harassment', 'concern', 'notice'] },
      ],
    },
    {
      title: 'Research & Duties',
      items: [
        { label: 'Library OPAC', href: '/faculty/library', icon: Library, keywords: ['books', 'catalog', 'hold', 'borrow'] },
        { label: 'Exam Invigilation Duty', href: '/faculty/invigilation', icon: Eye, keywords: ['exam cell', 'room', 'supervisor'] },
        { label: 'Re-evaluation Reassessment', href: '/faculty/re-evaluations', icon: FileText, keywords: ['exam cell', 'recheck', 'marks'] },
        { label: 'Research & Publications', href: '/faculty/research', icon: FlaskConical, keywords: ['scopus', 'patent', 'journal', 'pms'] },
        { label: 'R&D Grant Approvals', href: '/faculty/research-approvals', icon: Microscope, keywords: ['guide', 'research grant', 'student project'] },
        { label: 'Ph.D. Scholars', href: '/faculty/phd/scholars', icon: GraduationCap, keywords: ['phd', 'guide', 'scholar', 'thesis'] },
      ],
    },
    {
      title: 'Administration',
      items: [
        { label: 'Pending Approvals (Inbox)', href: '/faculty/inbox', icon: Inbox, keywords: ['approve', 'hod', 'pending on me', 'team'] },
        { label: 'Falcon Core Tasks (IQAC)', href: '/faculty/iqac', icon: ListChecks, keywords: ['iqac', 'upload', 'tasks'] },
        { label: 'Event Approvals', href: '/faculty/event-approvals', icon: ClipboardPen, keywords: ['club', 'events', 'coordinator'] },
        { label: 'Placement Coordinator', href: '/faculty/placement-coordinator', icon: Briefcase, keywords: ['placement', 'drives', 'coordinator'] },
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
        { label: 'Payslip Download Requests', href: '/hr/payroll/payslip-downloads', icon: Download, keywords: ['payslip', 'download', 'approval', 'reason'], hrModule: 'payroll' },
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
    { label: 'Payslip Download Requests', href: '/hr/payroll/payslip-downloads', icon: Download, hrModule: 'payroll' },
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
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/hod/dashboard', icon: LayoutDashboard, keywords: ['command center', 'metrics', 'attendance'] },
        { label: 'Department Timetable', href: '/hod/department-timetable', icon: CalendarClock, keywords: ['schedule', 'rooms', 'master'] },
      ],
    },
    {
      title: 'HR (Reporting Officer)',
      items: [
        { label: 'Team Directory (Zimyo)', href: '/hod/reporting-directory?tab=dashboard&scope=dept', icon: Users, keywords: ['zimyo', 'reporting', 'directory', 'attendance', 'leave', 'gate pass', 'hrms', 'dashboard', 'reports', 'probation', 'pending approvals', 'inbox', 'team requests'] },
        { label: 'Resignations & Offboarding', href: '/hod/approvals/resignations', icon: DoorOpen, keywords: ['resignation', 'exit', 'separation', 'fnf', 'offboarding'] },
        { label: 'Profile Corrections', href: '/hod/approvals/profile-corrections', icon: ClipboardCheck, keywords: ['student profile', 'edit', 'correction'] },
        { label: 'Proxy Approvals', href: '/hod/approvals/proxy', icon: Users, keywords: ['substitute', 'alternate', 'leave', 'proxy'] },
        { label: 'Extra Class Approvals', href: '/hod/approvals/extra-classes', icon: CalendarClock, keywords: ['substitute', 'cancel', 'timetable'] },
        { label: 'Event Approvals', href: '/hod/events', icon: PartyPopper, keywords: ['club', 'campus events'] },
        { label: 'Venue Booking Approvals', href: '/hod/venue-requests', icon: MapPin, keywords: ['room', 'booking', 'venue'] },
        { label: 'Project Funding', href: '/hod/funding-approvals', icon: Banknote, keywords: ['research', 'funding', 'budget'] },
      ],
    },
    {
      title: 'Faculty Management',
      items: [
        { label: 'Course Allocation', href: '/hod/academics/course-allocation', icon: BookOpen, keywords: ['assign', 'faculty', 'subjects', 'semester'] },
        { label: 'Upload Teaching Matrix', href: '/hod/academics/course-mapper', icon: Upload, keywords: ['excel', 'bulk', 'matrix', 'teaching load', 'import'] },
        { label: 'Unassigned Teaching Load', href: '/hod/academics/teaching-load', icon: AlertTriangle, keywords: ['nf', 'unassigned', 'matrix', 'hod'] },
        { label: 'Syllabus & Lesson Tracking', href: '/hod/academics/syllabus-tracking', icon: ListChecks, keywords: ['lms', 'modules', 'coverage', 'units'] },
        { label: 'Faculty Roster & Workload', href: '/hod/faculty/workload', icon: Users, keywords: ['hours', 'burnout', 'teaching load'] },
        { label: 'Appraisals & API Scores', href: '/hod/faculty/appraisals', icon: Award, keywords: ['research', 'hod rating', 'api', 'pms'] },
        { label: 'Meetings', href: '/hod/meetings', icon: CalendarClock, keywords: ['schedule', 'faculty', 'dean', 'minutes'] },
      ],
    },
    {
      title: 'Student Affairs',
      items: [
        { label: 'Student Monitor', href: '/hod/student-monitor', icon: GraduationCap, keywords: ['students', 'branch', 'filter'] },
        { label: 'Disciplinary Actions', href: '/hod/students/discipline', icon: Scale, keywords: ['discipline', 'demerit', 'misconduct', 'dc'] },
        { label: 'Attendance Exemptions', href: '/hod/attendance-exemptions', icon: ClipboardCheck, keywords: ['exemption', 'medical', 'accident', 'internship', 'admit card', 'low attendance'] },
        { label: 'Attendance Policy', href: '/hod/attendance-policy', icon: Scale, keywords: ['threshold', '75', '70', '65', 'relax', 'minimum'] },
        { label: 'Grievance Escalations', href: '/hod/students/grievances', icon: LifeBuoy, keywords: ['academic', 'ticket', 'escalation'] },
      ],
    },
    {
      title: 'Examination',
      items: [
        { label: 'Result Analytics', href: '/hod/academics/result-analytics', icon: BarChart3, keywords: ['pass', 'fail', 'exam', 'grades'] },
        { label: 'Compiled Results', href: '/hod/dashboard?tab=results', icon: FileSpreadsheet, keywords: ['marks', 'grades', 'export', 'semester'] },
      ],
    },
    {
      title: 'IQAC (Quality Assurance)',
      items: [
        { label: 'IQAC Submission Portal', href: '/hod/iqac', icon: ClipboardList, keywords: ['iqac', 'naac', 'nirf', 'reports', 'submission'] },
      ],
    },
    {
      title: 'Reports',
      items: [
        { label: 'Department Analytics', href: '/hod/reports', icon: LineChart, keywords: ['analytics', 'reports', 'trends', 'departmental'] },
      ],
    },
    myHrOperationsNavGroup('hod'),
  ],
  commandItems: flattenNavToCommandItems([
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/hod/dashboard', icon: LayoutDashboard, keywords: ['command center', 'metrics'] },
        { label: 'Department Timetable', href: '/hod/department-timetable', icon: CalendarClock, keywords: ['schedule'] },
      ],
    },
    {
      title: 'HR (Reporting Officer)',
      items: [
        { label: 'Team Directory (Zimyo)', href: '/hod/reporting-directory?tab=dashboard&scope=dept', icon: Users, keywords: ['zimyo', 'hrms', 'directory', 'gate pass', 'pending approvals', 'team requests'] },
        { label: 'Profile Corrections', href: '/hod/approvals/profile-corrections', icon: ClipboardCheck, keywords: ['profile', 'correction'] },
        { label: 'Proxy Approvals', href: '/hod/approvals/proxy', icon: Users, keywords: ['proxy'] },
        { label: 'Event Approvals', href: '/hod/events', icon: PartyPopper, keywords: ['events'] },
        { label: 'Venue Approvals', href: '/hod/venue-requests', icon: MapPin, keywords: ['venue'] },
      ],
    },
    {
      title: 'Faculty Management',
      items: [
        { label: 'Course Allocation', href: '/hod/academics/course-allocation', icon: BookOpen, keywords: ['assign faculty'] },
        { label: 'Upload Teaching Matrix', href: '/hod/academics/course-mapper', icon: Upload, keywords: ['excel', 'bulk', 'matrix'] },
        { label: 'Unassigned Teaching Load', href: '/hod/academics/teaching-load', icon: AlertTriangle, keywords: ['nf unassigned'] },
        { label: 'Syllabus & Lesson Tracking', href: '/hod/academics/syllabus-tracking', icon: ListChecks, keywords: ['lms'] },
        { label: 'Faculty Roster & Workload', href: '/hod/faculty/workload', icon: Users, keywords: ['workload'] },
        { label: 'Appraisals & API Scores', href: '/hod/faculty/appraisals', icon: Award, keywords: ['api'] },
        { label: 'Meetings', href: '/hod/meetings', icon: CalendarClock, keywords: ['meetings'] },
      ],
    },
    {
      title: 'Student Affairs',
      items: [
        { label: 'Student Monitor', href: '/hod/student-monitor', icon: GraduationCap, keywords: ['students'] },
        { label: 'Attendance Exemptions', href: '/hod/attendance-exemptions', icon: ClipboardCheck, keywords: ['exemption', 'medical'] },
        { label: 'Attendance Policy', href: '/hod/attendance-policy', icon: Scale, keywords: ['threshold', 'minimum'] },
        { label: 'Grievance Escalations', href: '/hod/students/grievances', icon: LifeBuoy, keywords: ['grievance'] },
      ],
    },
    {
      title: 'Examination',
      items: [
        { label: 'Result Analytics', href: '/hod/academics/result-analytics', icon: BarChart3, keywords: ['pass fail'] },
        { label: 'Compiled Results', href: '/hod/dashboard?tab=results', icon: FileSpreadsheet, keywords: ['compiled results'] },
      ],
    },
    {
      title: 'IQAC (Quality Assurance)',
      items: [
        { label: 'IQAC Submission Portal', href: '/hod/iqac', icon: ClipboardList, keywords: ['iqac'] },
      ],
    },
    {
      title: 'Reports',
      items: [
        { label: 'Department Analytics', href: '/hod/reports', icon: LineChart, keywords: ['reports', 'analytics'] },
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
        { label: 'Result Analytics', href: '/dean/academics/result-analytics', icon: BarChart3, keywords: ['pass', 'fail', 'grades', 'mid-term', 'pie chart'] },
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
        { label: 'Grievances', href: '/dean/students/grievances', icon: LifeBuoy, keywords: ['escalation', 'ticket'] },
        { label: 'Ph.D. Degree Awards', href: '/dean/phd/approvals', icon: GraduationCap, keywords: ['phd', 'bom', 'viva', 'degree'] },
      ],
    },
    {
      title: 'Approvals',
      items: [
        { label: 'Dean Inbox', href: '/dean/inbox', icon: Inbox, keywords: ['approve', 'escalation'] },
        { label: 'Attendance Policy', href: '/dean/attendance-policy', icon: Scale, keywords: ['threshold', '75', '70', '65', 'relax', 'minimum attendance'] },
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
        { label: 'Grievances', href: '/dean/students/grievances', icon: LifeBuoy, keywords: ['grievances'] },
      ],
    },
    {
      title: 'Approvals',
      items: [
        { label: 'Dean Inbox', href: '/dean/inbox', icon: Inbox, keywords: ['inbox'] },
        { label: 'Attendance Policy', href: '/dean/attendance-policy', icon: Scale, keywords: ['threshold', 'minimum attendance'] },
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

export const incubationPortal: PortalConfig = {
  personaLabel: 'Incubation Workspace',
  personaTitle: 'Entrepreneurship & Incubation Cell',
  homeHref: '/incubation/dashboard',
  navGroups: [
    {
      title: 'Incubation Dashboard',
      items: [
        {
          label: 'Overview',
          href: '/incubation/dashboard',
          icon: LayoutDashboard,
          keywords: ['startups', 'funds', 'cohorts', 'metrics'],
        },
      ],
    },
    {
      title: 'Startup Pipeline',
      items: [
        {
          label: 'New Applications',
          href: '/incubation/pipeline/applications',
          icon: Inbox,
          keywords: ['triage', 'pitch', 'submit'],
        },
        {
          label: 'L1 & L2 Approvals',
          href: '/incubation/pipeline/approvals',
          icon: Kanban,
          keywords: ['kanban', 'approve', 'review'],
        },
        {
          label: 'Active Portfolio',
          href: '/incubation/portfolio',
          icon: Briefcase,
          keywords: ['funded', 'operating', 'startups'],
        },
      ],
    },
    {
      title: 'Finance & Mentoring',
      items: [
        {
          label: 'Grant Management',
          href: '/incubation/grants',
          icon: DollarSign,
          keywords: ['disbursement', 'milestone', 'funding'],
        },
        {
          label: 'Mentor Network',
          href: '/incubation/mentors',
          icon: Handshake,
          keywords: ['alumni', 'industry', 'experts'],
        },
      ],
    },
    {
      title: 'Settings & Reports',
      items: [
        {
          label: 'Cohort Configurations',
          href: '/incubation/settings/cohort',
          icon: Settings,
          keywords: ['window', 'approver', 'open', 'close'],
        },
        {
          label: 'NAAC / NIRF Exports',
          href: '/incubation/reports',
          icon: FileSpreadsheet,
          keywords: ['export', 'government', 'seed funding'],
        },
      ],
    },
  ],
  commandItems: [
    { label: 'Incubation Overview', href: '/incubation/dashboard', icon: LayoutDashboard },
    { label: 'New Applications', href: '/incubation/pipeline/applications', icon: Inbox },
    { label: 'L1 & L2 Approvals', href: '/incubation/pipeline/approvals', icon: Kanban },
    { label: 'Active Portfolio', href: '/incubation/portfolio', icon: Briefcase },
    { label: 'Grant Management', href: '/incubation/grants', icon: DollarSign },
    { label: 'Mentor Network', href: '/incubation/mentors', icon: Handshake },
    { label: 'Cohort Settings', href: '/incubation/settings/cohort', icon: Settings },
    { label: 'NAAC / NIRF Export', href: '/incubation/reports', icon: FileSpreadsheet },
  ],
};

/** @deprecated Use incubationPortal — legacy alias for redirects */
export const ecellAdminPortal = incubationPortal;

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
        { label: 'Cheque Clearing', href: '/finance/cheque-clearing', icon: Banknote, keywords: ['cheque', 'bounce', 'deposit'] },
        { label: 'Club Event Fund Transfers', href: '/finance/events', icon: Ticket, keywords: ['events', 'clubs', 'transfer', 'funds'] },
        { label: 'Incubation Grant Payouts', href: '/finance/incubation-payouts', icon: Rocket, keywords: ['ecell', 'startup', 'disburse'] },
        { label: 'R&D Grant Budget Review', href: '/finance/rnd-budget', icon: FlaskConical, keywords: ['research', 'grant', 'budget'] },
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
        { label: 'Student R&D Grants', href: '/iqac/rnd', icon: FlaskConical, keywords: ['research grant', 'ranking', 'naac'] },
        { label: 'Ph.D. Scholar Pipeline', href: '/research/scholars', icon: GraduationCap, keywords: ['phd', 'scholar', 'lifecycle'] },
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
    { label: 'Student R&D Grants', href: '/iqac/rnd', icon: FlaskConical },
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
        { label: 'Venue Requests', href: '/library/venue-requests', icon: Building2, keywords: ['gd room', 'booking', 'student'] },
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

export const disciplinaryCommitteePortal: PortalConfig = {
  personaLabel: 'Disciplinary Committee',
  personaTitle: 'Student Conduct & Demerits',
  homeHref: '/disciplinary-committee/dashboard',
  navGroups: [
    {
      title: 'Review',
      items: [
        { label: 'Command Centre', href: '/disciplinary-committee/dashboard', icon: LayoutDashboard, keywords: ['dc', 'dashboard'] },
        { label: 'Disciplinary Queue', href: '/disciplinary-committee/queue', icon: Scale, keywords: ['pending', 'review', 'approve', 'demerit'] },
        { label: 'Safety Concerns', href: '/disciplinary-committee/safety-concerns', icon: Shield, keywords: ['ragging', 'harassment', 'sexual harassment'] },
      ],
    },
  ],
  commandItems: [
    { label: 'DC Dashboard', href: '/disciplinary-committee/dashboard', icon: LayoutDashboard },
    { label: 'Disciplinary Queue', href: '/disciplinary-committee/queue', icon: Scale },
    { label: 'Safety Concerns', href: '/disciplinary-committee/safety-concerns', icon: Shield },
  ],
};

export const researchPortal: PortalConfig = {
  personaLabel: 'Research & Ph.D.',
  personaTitle: 'Ph.D. Lifecycle Management',
  homeHref: '/research/drc/applications',
  navGroups: [
    {
      title: 'Ph.D. Lifecycle',
      items: [
        { label: 'Scholar Pipeline', href: '/research/scholars', icon: GraduationCap, keywords: ['phd', 'pipeline'], roles: ['IQAC', 'SuperAdmin', 'Dean', 'Chairman'] },
        { label: 'DRC Applications', href: '/research/drc/applications', icon: ClipboardList, keywords: ['pet', 'admission', 'interview'], roles: ['DRC_MEMBER', 'SuperAdmin'] },
        { label: 'RAC Reviews', href: '/research/rac/reviews', icon: Users, keywords: ['guide', 'progress', 'synopsis'], roles: ['RAC_MEMBER', 'SuperAdmin'] },
        { label: 'RRC Reviews', href: '/research/rrc/reviews', icon: FileText, keywords: ['thesis', 'viva', 'synopsis'], roles: ['RRC_MEMBER', 'SuperAdmin'] },
        { label: 'Adjudicator Reviews', href: '/research/adjudicator/reviews', icon: Scale, keywords: ['synopsis', 'thesis', 'evaluation'], roles: ['PHD_ADJUDICATOR', 'SuperAdmin'] },
        { label: 'Research Grants', href: '/research/grants', icon: FlaskConical, keywords: ['grants', 'funding'], roles: ['IQAC', 'Faculty', 'SuperAdmin', 'Chairman'] },
      ],
    },
  ],
  commandItems: [
    { label: 'DRC Applications', href: '/research/drc/applications', icon: ClipboardList },
    { label: 'RAC Reviews', href: '/research/rac/reviews', icon: Users },
    { label: 'RRC Reviews', href: '/research/rrc/reviews', icon: FileText },
    { label: 'Scholar Pipeline', href: '/research/scholars', icon: GraduationCap },
  ],
};

export const examCellPortal: PortalConfig = {
  personaLabel: 'Falcon Exam OS',
  personaTitle: 'Controller of Examinations',
  homeHref: '/exam-cell/dashboard',
  navGroups: [
    {
      title: 'Overview',
      items: [
        { label: 'Command Center', href: '/exam-cell/dashboard', icon: LayoutDashboard, keywords: ['coe', 'analytics'] },
        { label: 'Live Exam Dashboard', href: '/exam-cell/live-dashboard', icon: LineChart, keywords: ['realtime', 'exam day'] },
        { label: 'Examination Calendar', href: '/exam-cell/calendar', icon: Calendar, keywords: ['month', 'week', 'holidays'] },
        { label: 'My Tasks', href: '/exam-cell/my-tasks', icon: ListTodo, keywords: ['inbox', 'pending'] },
        { label: 'Global Search', href: '/exam-cell/search', icon: Search, keywords: ['find', 'student', 'prn', 'qr'] },
        { label: 'Student Timeline', href: '/exam-cell/student-timeline', icon: History, keywords: ['journey', 'registration'] },
        { label: 'Exam Sessions', href: '/exam-cell/sessions', icon: CalendarRange, keywords: ['academic year', 'semester cycle'] },
        { label: 'Deadlines', href: '/exam-cell/deadlines', icon: Timer, keywords: ['countdown', 'reminder'] },
        { label: 'Audit Log', href: '/exam-cell/audit-log', icon: Shield, keywords: ['compliance', 'trail'] },
      ],
    },
    {
      title: 'Pre-Exam Operations',
      items: [
        { label: 'Master Exam Schedule', href: '/exam-cell/schedule', icon: CalendarDays, keywords: ['mid term', 'end term', 'timetable'] },
        { label: 'Form Fill-up Desk', href: '/exam-cell/form-fillup', icon: FileCheck2, keywords: ['registration', 'eligibility'] },
        { label: 'Eligibility Dashboard', href: '/exam-cell/eligibility', icon: ClipboardCheck, keywords: ['attendance', 'fee', 'debarred'] },
        { label: 'Hall Ticket Approvals', href: '/exam-cell/hall-ticket-approvals', icon: FileCheck2, keywords: ['coe approval', 'workflow'] },
        { label: 'Exam Centres & Rooms', href: '/exam-cell/exam-centres', icon: DoorOpen, keywords: ['building', 'hall', 'capacity'] },
        { label: 'Admit Card Engine', href: '/exam-cell/admit-cards', icon: Ticket, keywords: ['hall ticket', 'admit'] },
        { label: 'Attendance Exemptions', href: '/exam-cell/attendance-exemptions', icon: ClipboardCheck, keywords: ['exemption', 'low attendance'] },
        { label: 'Seating Planner', href: '/exam-cell/seating', icon: ClipboardList, keywords: ['seating', 'rooms', 'ai'] },
        { label: 'Published Seating Plans', href: '/exam-cell/seating-plans', icon: ClipboardList, keywords: ['published seating'] },
        { label: 'Resource Allocation', href: '/exam-cell/resource-allocation', icon: LayoutGrid, keywords: ['coordinator', 'room'] },
        { label: 'Invigilation Roster', href: '/exam-cell/invigilation', icon: Eye, keywords: ['faculty', 'duty', 'auto assign'] },
        { label: 'Print & Export Hub', href: '/exam-cell/print-hub', icon: Printer, keywords: ['pdf', 'export', 'csv'] },
        { label: 'Question Paper Control', href: '/exam-cell/question-papers', icon: FolderLock, keywords: ['qp', 'moderation'] },
        { label: 'Exam Day Operations', href: '/exam-cell/exam-day', icon: Timer, keywords: ['attendance', 'qr verify'] },
        { label: 'Answer Sheet Tracking', href: '/exam-cell/answer-sheets', icon: FileText, keywords: ['qr', 'barcode', 'evaluator'] },
        { label: 'Document Repository', href: '/exam-cell/documents', icon: Archive, keywords: ['notices', 'circulars', 'verification'] },
      ],
    },
    {
      title: 'Post-Exam Operations',
      items: [
        { label: 'Result Control Centre', href: '/exam-cell/results', icon: TrendingUp, keywords: ['publish', 'bell curve', 'declare', 'marks entry'] },
        { label: 'Grade Cards & Merit', href: '/exam-cell/grade-cards', icon: Medal, keywords: ['marksheet', 'grade cards', 'cgpa', 'sgpa', 'top students', 'merit'] },
        { label: 'Course Grades', href: '/exam-cell/course-grades', icon: GraduationCap, keywords: ['grades', 'aggregate'] },
        { label: 'Backlog & Supplementary', href: '/exam-cell/backlog-exams', icon: ArrowUpCircle, keywords: ['back paper', 'supplementary'] },
        { label: 'Re-evaluations', href: '/exam-cell/re-evaluations', icon: FileText, keywords: ['recheck', 'backlog'] },
        { label: 'UFM Malpractice Desk', href: '/exam-cell/ufm-cases', icon: Shield, keywords: ['cheating', 'unfair means'] },
        { label: 'Degree & Transcripts', href: '/exam-cell/transcripts', icon: Award, keywords: ['digilocker', 'abc id'] },
        { label: 'Degree Eligibility Audit', href: '/exam-cell/degree-audit', icon: FileCheck2, keywords: ['credits', 'cgpa', 'clearance'] },
        { label: 'Examination Reports', href: '/exam-cell/reports', icon: BarChart3, keywords: ['pass percentage', 'rankers'] },
        { label: 'Advanced Analytics', href: '/exam-cell/analytics', icon: PieChart, keywords: ['management', 'charts', 'export'] },
        { label: 'Exam Notifications', href: '/exam-cell/notifications', icon: Bell, keywords: ['sms', 'email', 'alert'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Exam OS Dashboard', href: '/exam-cell/dashboard', icon: LayoutDashboard },
    { label: 'Exam Schedule', href: '/exam-cell/schedule', icon: CalendarDays },
    { label: 'Admit Cards', href: '/exam-cell/admit-cards', icon: Ticket },
    { label: 'Attendance Exemptions', href: '/exam-cell/attendance-exemptions', icon: ClipboardCheck },
    { label: 'Publish Results', href: '/exam-cell/results', icon: TrendingUp },
    { label: 'Grade Cards & Merit', href: '/exam-cell/grade-cards', icon: Medal },
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
        { label: 'Result Insights', href: '/president/insights', icon: PieChart, keywords: ['grades', 'pie chart', 'academic'] },
        { label: 'Finance', href: '/president/finance', icon: Wallet, keywords: ['collected', 'pending', 'charts'] },
        { label: 'Finance & Budgetary Control', href: '/president/finance-budget', icon: Landmark, keywords: ['budget', 'utilization', 'approvals'] },
        { label: 'Research & Extension Hub', href: '/president/research', icon: FlaskConical, keywords: ['research', 'patents', 'grants'] },
        { label: 'Compliance', href: '/president/compliance', icon: Shield, keywords: ['iqac', 'defaulting'] },
        { label: 'HR Analytics', href: '/president/hr-analytics', icon: Users, keywords: ['retention', 'faculty student ratio', 'payroll'] },
        { label: 'HR Approvals', href: '/president/hr-approvals', icon: CheckSquare, keywords: ['tenure', 'hiring', 'disciplinary'] },
        { label: 'Grievances Escalation', href: '/president/issues', icon: AlertTriangle, keywords: ['grievance', 'sla', 'compliance'] },
        { label: 'Executive Orders', href: '/president/executive-orders', icon: FileLock, keywords: ['suspension', 'emergency', 'ratification'] },
        { label: 'Convocation', href: '/president/convocation', icon: Award, keywords: ['medals', 'graduates', 'degrees'] },
        { label: 'Meetings', href: '/president/meetings', icon: CalendarClock, keywords: ['schedule', 'minutes', 'agenda'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Executive Summary', href: '/president/executive-summary', icon: LayoutDashboard },
    { label: 'Meetings', href: '/president/meetings', icon: CalendarClock },
    { label: 'Academics', href: '/president/academics', icon: GraduationCap },
    { label: 'Finance', href: '/president/finance', icon: Wallet },
    { label: 'Finance & Budgetary Control', href: '/president/finance-budget', icon: Landmark },
    { label: 'Research & Extension Hub', href: '/president/research', icon: FlaskConical },
    { label: 'Compliance', href: '/president/compliance', icon: Shield },
    { label: 'HR Analytics', href: '/president/hr-analytics', icon: Users },
    { label: 'HR Approvals', href: '/president/hr-approvals', icon: CheckSquare },
    { label: 'Grievances Escalation', href: '/president/issues', icon: AlertTriangle },
    { label: 'Executive Orders', href: '/president/executive-orders', icon: FileLock },
    { label: 'Convocation', href: '/president/convocation', icon: Award },
  ],
};

export const leadershipPortal: PortalConfig = {
  personaLabel: 'Chairman / Executive Board',
  personaTitle: 'Morning Briefing',
  homeHref: '/leadership/overview',
  navGroups: [
    {
      title: 'Command Center',
      items: [
        { label: 'Dashboard', href: '/leadership/overview', icon: LayoutDashboard, keywords: ['morning briefing', 'overview', 'kpi', 'home'] },
        { label: 'Approvals', href: '/leadership/approvals', icon: CheckSquare, keywords: ['inbox', 'approve', 'reject', 'workflow', 'po', 'waiver'] },
        { label: 'Financials', href: '/leadership/financial-oversight', icon: Landmark, keywords: ['budget', 'treasury', 'cash', 'revenue', 'defaulters'] },
        { label: 'Academics', href: '/leadership/academics', icon: GraduationCap, keywords: ['attendance', 'naac', 'placements', 'admissions'] },
        { label: 'Reports', href: '/leadership/intelligence', icon: LineChart, keywords: ['analytics', 'versus', 'forecast', 'ai', 'insights'] },
        { label: 'Vault', href: '/leadership/vault', icon: FileLock, keywords: ['documents', 'mou', 'legal', 'audit'] },
      ],
    },
  ],
  mobileNavItems: [
    { label: 'Dashboard', href: '/leadership/overview', icon: LayoutDashboard, shortLabel: 'Home' },
    { label: 'Approvals', href: '/leadership/approvals', icon: CheckSquare, shortLabel: 'Inbox' },
    { label: 'Financials', href: '/leadership/financial-oversight', icon: Landmark, shortLabel: 'Finance' },
    { label: 'Academics', href: '/leadership/academics', icon: GraduationCap, shortLabel: 'Academic' },
  ],
  commandItems: [
    { label: 'Dashboard', href: '/leadership/overview', icon: LayoutDashboard },
    { label: 'Approvals Inbox', href: '/leadership/approvals', icon: CheckSquare },
    { label: 'Financial Oversight', href: '/leadership/financial-oversight', icon: Landmark },
    { label: 'Cash Flow', href: '/leadership/finance', icon: Wallet },
    { label: 'Budget Allocation', href: '/leadership/budget-allocation', icon: Banknote },
    { label: 'Budget Monitor', href: '/leadership/budget-monitor', icon: BarChart3 },
    { label: 'Finance Config', href: '/leadership/finance-config', icon: Settings },
    { label: 'Academics', href: '/leadership/academics', icon: GraduationCap },
    { label: 'Admissions Funnel', href: '/leadership/admissions-funnel', icon: TrendingUp },
    { label: 'Placements', href: '/leadership/placements', icon: Briefcase },
    { label: 'Result Insights', href: '/leadership/insights', icon: PieChart },
    { label: 'HR Economics', href: '/leadership/hr-ops', icon: Users },
    { label: 'Alumni & Fundraising', href: '/leadership/alumni', icon: Heart },
    { label: 'Infrastructure', href: '/leadership/infrastructure', icon: Building2 },
    { label: 'Grievances', href: '/leadership/issues', icon: AlertTriangle },
    { label: 'Automated Insights', href: '/leadership/intelligence', icon: LineChart },
    { label: 'Versus Analytics', href: '/leadership/versus', icon: LineChart },
    { label: 'Strategy Forecast', href: '/leadership/forecasting', icon: TrendingUp },
    { label: 'Action Center', href: '/leadership/action-center', icon: Target },
    { label: 'Task Delegation', href: '/leadership/tasks', icon: ClipboardList },
    { label: 'Broadcasts', href: '/leadership/broadcasts', icon: Megaphone },
    { label: 'Confidential Memos', href: '/leadership/memos', icon: ScrollText },
    { label: 'VIP & Fundraising', href: '/leadership/vip-network', icon: Users },
    { label: 'Compliance Calendar', href: '/leadership/compliance-calendar', icon: Calendar },
    { label: 'Audit Trail', href: '/leadership/audit-log', icon: Shield },
    { label: 'Meetings', href: '/leadership/meetings', icon: Video },
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
        { label: 'Campus Announcements', href: '/admin-ops/announcements', icon: Megaphone, keywords: ['news', 'notice', 'board'] },
        { label: 'Convocation & Certificates', href: '/admin-ops/convocation', icon: GraduationCap, keywords: ['degree', 'convocation', 'pdf', 'digilocker'] },
        { label: 'Event Venue Approvals', href: '/admin-ops/events', icon: Ticket },
        { label: 'Student Venue Requests', href: '/admin-ops/venue-requests', icon: Building2, keywords: ['seminar', 'estate', 'booking'] },
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
        { label: 'Governance Tasks', href: '/admin/tasks', icon: ListChecks },
        { label: 'Upload History', href: '/admin/tasks?section=uploads', icon: History },
      ],
    },
    {
      title: 'Modules',
      items: [
        { label: 'IAM & Hierarchy', href: '/admin/iam', icon: Shield, roles: ['SuperAdmin', 'Registrar'] },
        { label: 'Admissions CRM', href: '/admin/admissions', icon: Kanban, roles: ['SuperAdmin', 'AdmissionsOfficer'] },
        { label: 'Student Verifications', href: '/admin/verifications', icon: FileCheck2, roles: ['SuperAdmin', 'AdmissionsOfficer', 'Registrar'] },
        { label: 'Academics', href: '/admin/academics', icon: GraduationCap, roles: ['SuperAdmin', 'Registrar'] },
        { label: 'Student Excel Upload', href: '/admin/students/bulk-upload', icon: Upload, roles: ['SuperAdmin', 'Registrar', 'AdmissionsOfficer'] },
        { label: 'Finance', href: '/admin/finance', icon: Wallet, roles: ['SuperAdmin', 'Accountant', 'President'] },
        { label: 'HR & Payroll', href: '/admin/hr', icon: Users, roles: ['SuperAdmin', 'HR', 'President'] },
        { label: 'IQAC & Placements', href: '/admin/iqac', icon: BarChart3, roles: ['SuperAdmin', 'IQAC', 'PlacementCell', 'President'] },
        { label: 'Operations', href: '/admin/operations', icon: Bus, roles: ['SuperAdmin', 'Warden', 'Librarian', 'TransportOfficer'] },
        { label: 'Settings & IT', href: '/admin/settings', icon: Settings, roles: ['SuperAdmin'] },
        { label: 'University Directory', href: '/directory', icon: Contact, roles: ['SuperAdmin', 'Registrar', 'President'] },
        { label: 'Ph.D. Admissions & Awards', href: '/admin/phd/admissions', icon: GraduationCap, roles: ['SuperAdmin', 'Registrar'] },
      ],
    },
  ],
  commandItems: [
    { label: 'Admissions Kanban', href: '/admin/admissions', icon: Kanban, roles: ['SuperAdmin', 'AdmissionsOfficer'] },
    { label: 'Pending Approvals', href: '/admin/inbox', icon: ListChecks },
    { label: 'University Directory', href: '/directory', icon: Contact },
    { label: 'Export Reports', href: '/admin/reports', icon: BarChart3, roles: ['SuperAdmin', 'President', 'IQAC'] },
  ],
};
