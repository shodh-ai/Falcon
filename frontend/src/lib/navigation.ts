import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Wallet,
  GraduationCap,
  Building2,
  DoorOpen,
  User,
  ClipboardCheck,
  CalendarDays,
  ListChecks,
  Users,
  BarChart3,
  Kanban,
  Settings,
  BookOpen,
  Bus,
  Shield,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  keywords?: string[];
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

export const studentPortal: PortalConfig = {
  personaLabel: 'Student Portal',
  personaTitle: 'My SGVU',
  homeHref: '/student/dashboard',
  navGroups: [
    {
      title: 'Home',
      items: [{ label: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard, keywords: ['home', 'overview'] }],
    },
    {
      title: 'Academics',
      items: [
        { label: 'Course Registration', href: '/student/courses', icon: BookOpen, keywords: ['cbcs', 'electives'] },
        { label: 'Exams & Hall Ticket', href: '/student/exams', icon: GraduationCap, keywords: ['exam', 'hall ticket'] },
      ],
    },
    {
      title: 'Finance',
      items: [{ label: 'Fees & Payments', href: '/student/fees', icon: Wallet, keywords: ['fee', 'pay', 'dues'] }],
    },
    {
      title: 'Operations',
      items: [
        { label: 'Hostel', href: '/student/hostel', icon: Building2, keywords: ['hostel', 'room'] },
        { label: 'Gate Pass', href: '/student/gate-pass', icon: DoorOpen, keywords: ['hostel', 'gate', 'qr', 'exit'] },
      ],
    },
    {
      title: 'Account',
      items: [{ label: 'Profile & ID Card', href: '/student/profile', icon: User, keywords: ['profile', 'id'] }],
    },
  ],
  commandItems: [
    { label: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard },
    { label: 'Pay Fees', href: '/student/fees', icon: Wallet, keywords: ['finance'] },
    { label: 'Apply for Gate Pass', href: '/student/gate-pass', icon: DoorOpen, keywords: ['hostel'] },
    { label: 'Download Hall Ticket', href: '/student/exams', icon: GraduationCap },
    { label: 'Course Registration', href: '/student/courses', icon: BookOpen },
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
      items: [{ label: 'Mark Attendance', href: '/faculty/attendance', icon: ClipboardCheck, keywords: ['attendance', 'class'] }],
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
        { label: 'IAM & Hierarchy', href: '/admin/iam', icon: Shield },
        { label: 'Admissions CRM', href: '/admin/admissions', icon: Kanban },
        { label: 'Academics', href: '/admin/academics', icon: GraduationCap },
        { label: 'Finance', href: '/admin/finance', icon: Wallet },
        { label: 'HR & Payroll', href: '/admin/hr', icon: Users },
        { label: 'IQAC & Placements', href: '/admin/iqac', icon: BarChart3 },
        { label: 'Operations', href: '/admin/operations', icon: Bus },
        { label: 'Settings & IT', href: '/admin/settings', icon: Settings },
      ],
    },
  ],
  commandItems: [
    { label: 'Admissions Kanban', href: '/admin/admissions', icon: Kanban },
    { label: 'Pending Approvals', href: '/admin/dashboard', icon: ListChecks },
    { label: 'Export Reports', href: '/admin/dashboard', icon: BarChart3 },
  ],
};
