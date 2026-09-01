/**
 * FINAL Registrar Portal sidebar (Registrar-only).
 *
 * Structure must match product FINAL IA exactly — no extra visible items.
 * Reuses existing routes/pages/APIs. Does not change adminPortal
 * (SuperAdmin / shared Management console) or Campus Admin / other portals.
 *
 * Features that exist but are not in the FINAL IA remain reachable by URL
 * (pages are not deleted); they are intentionally omitted from this sidebar.
 */
import {
  BadgeCheck,
  BarChart3,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Contact,
  FileCheck2,
  FolderLock,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  PenLine,
  RefreshCw,
  Scale,
  ScrollText,
  Settings,
  Shield,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import type { PortalConfig } from '@/lib/navigation';

const R = ['Registrar'] as const;

/**
 * FINAL REGISTRAR SIDEBAR
 *
 * Overview → Registrar Desk → Certificates & Degrees →
 * Governance & Compliance → University Administration → Security & Access
 */
export const registrarPortal: PortalConfig = {
  personaLabel: 'Registrar',
  personaTitle: 'Registrar Command Center',
  homeHref: '/admin/dashboard',
  collapsibleNavGroups: true,
  sidebarBrandLabel: 'SGVU Workspace',
  // Mobile bottom bar — FINAL desk shortcuts only (not old adminPortal leftovers).
  mobileNavItems: [
    { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, roles: [...R] },
    { label: 'Enrollment', href: '/admin/enrollment', icon: UserPlus, roles: [...R] },
    { label: 'Verifications', href: '/admin/verifications', icon: FileCheck2, roles: [...R] },
    { label: 'Certificates', href: '/admin/certificates', icon: ScrollText, roles: [...R] },
  ],
  navGroups: [
    {
      title: 'Overview',
      items: [
        {
          label: 'Dashboard',
          href: '/admin/dashboard',
          icon: LayoutDashboard,
          roles: [...R],
          keywords: ['home', 'command center', 'kpi'],
        },
        {
          label: 'Registrar Reports & Analytics',
          href: '/admin/registrar-reports',
          icon: BarChart3,
          roles: [...R],
          keywords: ['reports', 'analytics', 'enrollment', 'lifecycle'],
        },
        {
          label: 'University Directory',
          href: '/directory',
          icon: Contact,
          roles: [...R],
          keywords: ['directory', 'search', 'people', '360'],
        },
      ],
    },
    {
      title: 'Registrar Desk',
      items: [
        {
          label: 'Student Enrollment',
          href: '/admin/enrollment',
          icon: UserPlus,
          roles: [...R],
          keywords: ['enroll', 'prn', 'fee', 'admission', 'student id'],
        },
        {
          label: 'Student Verifications',
          href: '/admin/verifications',
          icon: FileCheck2,
          roles: [...R],
          keywords: ['onboarding', 'approve', 'reject'],
        },
        {
          label: 'Master Student Records',
          href: '/admin/student-records',
          icon: Contact,
          roles: [...R],
          keywords: ['profile', 'documents', 'student 360', 'edit student', 'vault', 'master'],
        },
        {
          label: 'Student Lifecycle',
          href: '/admin/student-lifecycle',
          icon: RefreshCw,
          roles: [...R],
          keywords: ['lifecycle', 'status', 'active', 'withdrawn', 'graduated', 'alumni'],
        },
        {
          label: 'Semester Registrations',
          href: '/admin/semester-registrations',
          icon: ClipboardCheck,
          roles: [...R],
          keywords: ['approve', 'reject', 'send back', 'registration'],
        },
        {
          label: 'Profile Corrections',
          href: '/admin/profile-corrections',
          icon: ClipboardCheck,
          roles: [...R],
          keywords: ['profile', 'correction', 'tickets', 'edit unlock'],
        },
      ],
    },
    {
      title: 'Certificates & Degrees',
      items: [
        {
          label: 'Certificate Desk',
          href: '/admin/certificates',
          icon: ScrollText,
          roles: [...R],
          keywords: ['transcript', 'bonafide', 'migration', 'degree', 'dsc'],
        },
        {
          label: 'Degree Eligibility',
          href: '/admin/degree-eligibility',
          icon: BadgeCheck,
          roles: [...R],
          keywords: ['graduation', 'credits', 'cgpa', 'clearance'],
        },
        {
          label: 'Digital Signature',
          href: '/admin/account/settings/digital-signature',
          icon: PenLine,
          roles: [...R],
          keywords: ['dsc', 'sign', 'certificate', 'renewal'],
        },
        {
          label: 'Convocation Management',
          href: '/admin-ops/convocation',
          icon: GraduationCap,
          roles: [...R],
          keywords: ['convocation', 'degree ceremony', 'certificate automation'],
        },
      ],
    },
    {
      title: 'Governance & Compliance',
      items: [
        {
          label: 'Governance Tasks',
          href: '/admin/tasks',
          icon: ListChecks,
          roles: [...R],
          keywords: ['approvals', 'council', 'policy', 'circular'],
        },
        {
          label: 'Academic Petitions',
          href: '/admin/academic-petitions',
          icon: ClipboardList,
          roles: [...R],
          keywords: ['transfer certificate', 'tc', 'name correction', 'course change', 'migration'],
        },
        {
          label: 'Legal & RTI',
          href: '/admin/legal-rti',
          icon: Scale,
          roles: [...R],
          keywords: ['rti', 'legal', 'compliance'],
        },
        {
          label: 'NAAC / UGC Compliance',
          href: '/iqac/repository',
          icon: FolderLock,
          roles: [...R],
          keywords: ['naac', 'ugc', 'aqar', 'ssr', 'accreditation', 'repository'],
        },
        {
          label: 'Master Audit Logs',
          href: '/admin/audit-logs',
          icon: ScrollText,
          roles: [...R],
          keywords: ['audit', 'history', 'trail', 'compliance', 'master'],
        },
      ],
    },
    {
      title: 'University Administration',
      items: [
        {
          label: 'Departments & Academics',
          href: '/admin/departments',
          icon: Building2,
          roles: [...R],
          keywords: ['department', 'hod', 'school', 'academic structure', 'academics'],
        },
        {
          label: 'Staff Appointment & Verification',
          href: '/admin/staff-appointments',
          icon: UserCheck,
          roles: [...R],
          keywords: ['appointment', 'verification', 'hiring', 'letter', 'faculty', 'staff', 'dsc'],
        },
        {
          label: 'Official Communication',
          href: '/admin/communication',
          icon: Megaphone,
          roles: [...R],
          keywords: ['announcement', 'notice board', 'communication', 'official'],
        },
      ],
    },
    {
      title: 'Security & Access',
      items: [
        {
          label: 'IAM & Hierarchy',
          href: '/admin/iam',
          icon: Shield,
          roles: [...R],
          keywords: ['roles', 'hierarchy', 'assignments'],
        },
        {
          label: 'User Management',
          href: '/admin/users',
          icon: Users,
          roles: [...R],
          keywords: ['users', 'roles', 'accounts', 'activate', 'deactivate'],
        },
        {
          // Platform /admin/settings is stub + RBAC-blocked for pure Registrar.
          // Account settings is the real, authorized settings surface.
          label: 'System Settings',
          href: '/admin/account/settings',
          icon: Settings,
          roles: [...R],
          keywords: ['settings', 'account', 'password', 'security', 'notifications'],
        },
      ],
    },
  ],
  commandItems: [
    { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, roles: [...R] },
    { label: 'Student Enrollment', href: '/admin/enrollment', icon: UserPlus, roles: [...R] },
    { label: 'Student Verifications', href: '/admin/verifications', icon: FileCheck2, roles: [...R] },
    { label: 'Master Student Records', href: '/admin/student-records', icon: Contact, roles: [...R] },
    { label: 'Student Lifecycle', href: '/admin/student-lifecycle', icon: RefreshCw, roles: [...R] },
    { label: 'Semester Registrations', href: '/admin/semester-registrations', icon: ClipboardCheck, roles: [...R] },
    { label: 'Profile Corrections', href: '/admin/profile-corrections', icon: ClipboardCheck, roles: [...R] },
    { label: 'Certificate Desk', href: '/admin/certificates', icon: ScrollText, roles: [...R] },
    { label: 'Degree Eligibility', href: '/admin/degree-eligibility', icon: BadgeCheck, roles: [...R] },
    { label: 'Digital Signature', href: '/admin/account/settings/digital-signature', icon: PenLine, roles: [...R] },
    { label: 'Convocation Management', href: '/admin-ops/convocation', icon: GraduationCap, roles: [...R] },
    { label: 'Governance Tasks', href: '/admin/tasks', icon: ListChecks, roles: [...R] },
    { label: 'Academic Petitions', href: '/admin/academic-petitions', icon: ClipboardList, roles: [...R] },
    { label: 'Legal & RTI', href: '/admin/legal-rti', icon: Scale, roles: [...R] },
    { label: 'NAAC / UGC Compliance', href: '/iqac/repository', icon: FolderLock, roles: [...R] },
    { label: 'Master Audit Logs', href: '/admin/audit-logs', icon: ScrollText, roles: [...R] },
    { label: 'Registrar Reports & Analytics', href: '/admin/registrar-reports', icon: BarChart3, roles: [...R] },
    { label: 'University Directory', href: '/directory', icon: Contact, roles: [...R] },
    { label: 'Departments & Academics', href: '/admin/departments', icon: Building2, roles: [...R] },
    { label: 'Staff Appointment & Verification', href: '/admin/staff-appointments', icon: UserCheck, roles: [...R] },
    { label: 'Official Communication', href: '/admin/communication', icon: Megaphone, roles: [...R] },
    { label: 'IAM & Hierarchy', href: '/admin/iam', icon: Shield, roles: [...R] },
    { label: 'User Management', href: '/admin/users', icon: Users, roles: [...R] },
    { label: 'System Settings', href: '/admin/account/settings', icon: Settings, roles: [...R] },
  ],
};

/** True when the signed-in user should get the Registrar IA sidebar (not SuperAdmin/CampusAdmin). */
export function isPureRegistrarRoles(roles: string[] | undefined | null): boolean {
  const normalized = (roles ?? [])
    .map((r) => String(r ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (!normalized.includes('registrar')) return false;
  if (normalized.includes('superadmin') || normalized.includes('campusadmin')) return false;
  return true;
}
