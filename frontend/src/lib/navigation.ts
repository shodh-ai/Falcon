import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Wallet,
  GraduationCap,
  ClipboardCheck,
  ClipboardList,
  CalendarDays,
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
  personaTitle: 'My SGVU',
  homeHref: '/student/dashboard',
  navGroups: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard, keywords: ['home', 'overview'] }],
    },
    {
      title: 'Academics',
      items: [
        { label: 'Academics', href: '/student/academics', icon: GraduationCap, keywords: ['grades', 'attendance', 'results'] },
        { label: 'Examinations', href: '/student/exams', icon: ClipboardList, keywords: ['exam', 'hall ticket', 'admit card', 'schedule'] },
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
    { label: 'Academics', href: '/student/academics', icon: GraduationCap },
    { label: 'Examinations', href: '/student/exams', icon: ClipboardList },
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
        { label: 'Mark Attendance', href: '/faculty/attendance', icon: ClipboardCheck, keywords: ['attendance', 'class'] },
        { label: 'Mentorship & Certificates', href: '/faculty/mentorship', icon: Handshake, keywords: ['proctor', 'mentor', 'certificates'] },
      ],
    },
    {
      title: 'HR',
      items: [{ label: 'My Leaves', href: '/faculty/leaves', icon: CalendarDays, keywords: ['leave', 'cl', 'sl'] }],
    },
    {
      title: 'IQAC',
      items: [{ label: 'Compliance Tasks', href: '/faculty/iqac', icon: ListChecks, keywords: ['iqac', 'upload'] }],
    },
  ],
  commandItems: [
    { label: 'Mark Attendance', href: '/faculty/attendance', icon: ClipboardCheck },
    { label: 'Mentorship & Certificates', href: '/faculty/mentorship', icon: Handshake },
    { label: 'Apply for Leave', href: '/faculty/leaves', icon: CalendarDays },
    { label: 'IQAC Tasks', href: '/faculty/iqac', icon: ListChecks },
  ],
};

export const adminPortal: PortalConfig = {
  personaLabel: 'Management',
  personaTitle: 'ERP Control Panel',
  homeHref: '/admin/dashboard',
  navGroups: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
        { label: 'Legacy IQAC Admin', href: '/dashboard', icon: ListChecks },
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
