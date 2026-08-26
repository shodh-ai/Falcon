import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  FileSpreadsheet,
  GraduationCap,
  Inbox,
  Kanban,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Network,
  Settings,
  Shield,
  Ticket,
  UserRound,
  Users,
  UserCog,
  FileCheck2,
} from 'lucide-react';
import type { NavGroup, PortalConfig } from '@/lib/navigation';
import { campusAdminRoutes, normalizeRoleName } from '@/lib/campus-admin.roles';

export type CampusAdminNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  shortLabel?: string;
  /** When false, item is omitted from the Campus Admin sidebar (no real backend yet). */
  implemented?: boolean;
};

export type CampusAdminNavSection = {
  title: string;
  items: CampusAdminNavItem[];
};

/** Sidebar sections for Campus Admin — only items with real pages/APIs are visible. */
export const campusAdminNavSections: CampusAdminNavSection[] = [
  {
    title: 'Overview',
    items: [
      {
        label: 'Dashboard',
        href: campusAdminRoutes.dashboard,
        icon: LayoutDashboard,
        shortLabel: 'Home',
        implemented: true,
      },
    ],
  },
  {
    title: 'User Management',
    items: [
      {
        label: 'Users',
        href: campusAdminRoutes.peopleUsers,
        icon: UserCog,
        shortLabel: 'Users',
        implemented: true,
      },
      {
        label: 'Students',
        href: campusAdminRoutes.peopleStudents,
        icon: GraduationCap,
        implemented: true,
      },
      {
        label: 'Faculty',
        href: campusAdminRoutes.peopleFaculty,
        icon: UserRound,
        implemented: true,
      },
      {
        label: 'HODs',
        href: campusAdminRoutes.peopleHods,
        icon: Network,
        implemented: true,
      },
      {
        label: 'Staff & Admin',
        href: campusAdminRoutes.peopleStaff,
        icon: Users,
        implemented: true,
      },
    ],
  },
  {
    title: 'Academics',
    items: [
      {
        label: 'Departments',
        href: campusAdminRoutes.departments,
        icon: Building2,
        implemented: true,
      },
      {
        label: 'Programs & Courses',
        href: campusAdminRoutes.programsCourses,
        icon: BookOpen,
        implemented: true,
      },
      {
        label: 'Academic Calendar',
        href: campusAdminRoutes.academicsCalendar,
        icon: CalendarDays,
        implemented: true,
      },
      {
        label: 'Timetable',
        href: campusAdminRoutes.academicsTimetable,
        icon: ClipboardList,
        implemented: true,
      },
    ],
  },
  {
    title: 'Campus Operations',
    items: [
      {
        label: 'Buildings & Classrooms',
        href: campusAdminRoutes.academicsClassrooms,
        icon: DoorOpen,
        implemented: true,
      },
      {
        label: 'Facilities & Venues',
        href: campusAdminRoutes.operationsFacilities,
        icon: Building2,
        implemented: true,
      },
    ],
  },
  {
    title: 'Communication & Support',
    items: [
      {
        label: 'Announcements',
        href: campusAdminRoutes.operationsAnnouncements,
        icon: Megaphone,
        implemented: true,
      },
      {
        label: 'Events',
        href: campusAdminRoutes.operationsEvents,
        icon: CalendarDays,
        implemented: true,
      },
      {
        label: 'Helpdesk / Tickets',
        href: campusAdminRoutes.operationsRequests,
        icon: Ticket,
        implemented: true,
      },
    ],
  },
  {
    title: 'Reports & Compliance',
    items: [
      {
        label: 'Analytics',
        href: campusAdminRoutes.analytics,
        icon: BarChart3,
        implemented: true,
      },
      {
        label: 'Campus Reports',
        href: campusAdminRoutes.reports,
        icon: FileSpreadsheet,
        implemented: true,
      },
    ],
  },
  {
    title: 'Security & Settings',
    items: [
      {
        label: 'Campus Hierarchy',
        href: campusAdminRoutes.hierarchy,
        icon: Network,
        implemented: true,
      },
      {
        label: 'Roles & Permissions',
        href: campusAdminRoutes.rolesPermissions,
        icon: Shield,
        implemented: true,
      },
      {
        label: 'Campus Profile',
        href: campusAdminRoutes.campusProfile,
        icon: Landmark,
        implemented: true,
      },
      {
        label: 'System Settings',
        href: campusAdminRoutes.accountSettings,
        icon: Settings,
        implemented: true,
      },
    ],
  },
];

/** Admissions Officer uses a reduced nav (routes remain; not shown to full Campus Admin). */
export const admissionsOfficerNavSections: CampusAdminNavSection[] = [
  {
    title: 'Overview',
    items: [
      {
        label: 'Dashboard',
        href: campusAdminRoutes.dashboard,
        icon: LayoutDashboard,
        shortLabel: 'Home',
        implemented: true,
      },
    ],
  },
  {
    title: 'Admissions',
    items: [
      {
        label: 'Kanban Board',
        href: campusAdminRoutes.admissionsKanban,
        icon: Kanban,
        implemented: true,
      },
      {
        label: 'Applications',
        href: campusAdminRoutes.admissionsApplications,
        icon: Inbox,
        implemented: true,
      },
      {
        label: 'Verifications',
        href: campusAdminRoutes.admissionsVerifications,
        icon: FileCheck2,
        implemented: true,
      },
      {
        label: 'Counselling',
        href: campusAdminRoutes.admissionsCounselling,
        icon: Users,
        implemented: true,
      },
      {
        label: 'Enrolled Students',
        href: campusAdminRoutes.admissionsEnrolledStudents,
        icon: GraduationCap,
        implemented: true,
      },
    ],
  },
  {
    title: 'Account',
    items: [
      {
        label: 'My Leave',
        href: campusAdminRoutes.myLeave,
        icon: CalendarDays,
        implemented: true,
      },
      {
        label: 'System Settings',
        href: campusAdminRoutes.accountSettings,
        icon: Settings,
        implemented: true,
      },
    ],
  },
];

function sectionsToNavGroups(sections: CampusAdminNavSection[]): NavGroup[] {
  return sections
    .map((section) => ({
      title: section.title,
      items: section.items
        .filter((item) => item.implemented !== false)
        .map(({ label, href, icon, shortLabel }) => ({
          label,
          href,
          icon,
          shortLabel,
        })),
    }))
    .filter((group) => group.items.length > 0);
}

function isAdmissionsOfficerOnly(roles: string[]): boolean {
  const normalized = roles.map(normalizeRoleName);
  return normalized.includes('admissionsofficer') && !normalized.includes('campusadmin');
}

export function buildCampusAdminPortalConfig(userRoles: string[]): PortalConfig {
  const sections = isAdmissionsOfficerOnly(userRoles)
    ? admissionsOfficerNavSections
    : campusAdminNavSections;

  const navGroups = sectionsToNavGroups(sections);
  const commandItems = navGroups.flatMap((group) => group.items);
  const admissionsOnly = isAdmissionsOfficerOnly(userRoles);

  const mobileNavItems = admissionsOnly
    ? [
        commandItems.find((item) => item.href === campusAdminRoutes.dashboard),
        commandItems.find((item) => item.href === campusAdminRoutes.admissionsKanban),
        commandItems.find((item) => item.href === campusAdminRoutes.admissionsApplications),
        commandItems.find((item) => item.href === campusAdminRoutes.accountSettings),
      ]
    : [
        commandItems.find((item) => item.href === campusAdminRoutes.dashboard),
        commandItems.find((item) => item.href === campusAdminRoutes.peopleStudents),
        commandItems.find((item) => item.href === campusAdminRoutes.operationsAnnouncements),
        commandItems.find((item) => item.href === campusAdminRoutes.campusProfile),
      ];

  return {
    personaLabel: 'Campus Administration',
    personaTitle: 'Campus operations, user management, and academic structure',
    homeHref: campusAdminRoutes.dashboard,
    includeAccountSettingsNav: false,
    hideWorkspaceSwitcher: true,
    collapsibleNavGroups: false,
    sidebarBrandLabel: 'FALCON',
    navGroups,
    commandItems,
    mobileNavItems: mobileNavItems.filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
}

export function findCampusAdminNavContext(
  pathname: string | null,
  userRoles: string[],
): { groupTitle: string; itemLabel: string } | null {
  if (!pathname) return null;
  const sections = isAdmissionsOfficerOnly(userRoles)
    ? admissionsOfficerNavSections
    : campusAdminNavSections;

  for (const section of sections) {
    for (const item of section.items) {
      if (item.implemented === false) continue;
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return { groupTitle: section.title, itemLabel: item.label };
      }
    }
  }
  return null;
}
