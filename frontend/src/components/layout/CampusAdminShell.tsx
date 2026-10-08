'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import type { PortalConfig } from '@/lib/navigation';
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  FileSpreadsheet,
  FileCheck2,
  GraduationCap,
  Inbox,
  Kanban,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Network,
  School,
  Ticket,
  UserRound,
  Users,
} from 'lucide-react';
import { StaffLeaveStatusBanner } from '@/components/self-service/StaffLeaveStatusBanner';
import { AdmissionsLeaveNotificationListener } from '@/components/self-service/AdmissionsLeaveNotificationListener';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';

export function CampusAdminShell({ children }: { children: ReactNode }) {
  const campusAdminPortal: PortalConfig = {
    personaLabel: 'Campus Admin',
    personaTitle: 'Campus operations & admissions',
    homeHref: campusAdminRoutes.dashboard,
    includeAccountSettingsNav: false,
    hideWorkspaceSwitcher: true,
    navGroups: [
      {
        title: 'Overview',
        items: [
          { label: 'Dashboard', href: campusAdminRoutes.dashboard, icon: LayoutDashboard },
        ],
      },
      {
        title: 'Campus Management',
        items: [
          { label: 'Campus Profile', href: campusAdminRoutes.campusProfile, icon: Landmark },
          { label: 'Hierarchy', href: campusAdminRoutes.hierarchy, icon: Network },
          { label: 'Departments', href: campusAdminRoutes.departments, icon: Building2 },
          { label: 'Programs & Courses', href: campusAdminRoutes.programsCourses, icon: BookOpen },
          { label: 'Faculty & Staff', href: campusAdminRoutes.facultyStaff, icon: UserRound },
          { label: 'Students', href: campusAdminRoutes.students, icon: GraduationCap },
        ],
      },
      {
        title: 'Admissions',
        items: [
          { label: 'Kanban Board', href: campusAdminRoutes.admissionsKanban, icon: Kanban },
          { label: 'Applications', href: campusAdminRoutes.admissionsApplications, icon: Inbox },
          { label: 'Verifications', href: campusAdminRoutes.admissionsVerifications, icon: FileCheck2 },
          { label: 'Counselling', href: campusAdminRoutes.admissionsCounselling, icon: Users },
          {
            label: 'Enrolled Students',
            href: campusAdminRoutes.admissionsEnrolledStudents,
            icon: School,
          },
        ],
      },
      {
        title: 'Academics',
        items: [
          { label: 'Academic Calendar', href: campusAdminRoutes.academicsCalendar, icon: CalendarDays },
          { label: 'Timetable', href: campusAdminRoutes.academicsTimetable, icon: ClipboardList },
          { label: 'Classrooms', href: campusAdminRoutes.academicsClassrooms, icon: DoorOpen },
        ],
      },
      {
        title: 'Campus Operations',
        items: [
          { label: 'Announcements', href: campusAdminRoutes.operationsAnnouncements, icon: Megaphone },
          { label: 'Events', href: campusAdminRoutes.operationsEvents, icon: CalendarDays },
          { label: 'Facilities', href: campusAdminRoutes.operationsFacilities, icon: Building2 },
          { label: 'Campus Requests', href: campusAdminRoutes.operationsRequests, icon: Ticket },
        ],
      },
      {
        title: 'Reports',
        items: [
          { label: 'Campus Reports', href: campusAdminRoutes.reports, icon: FileSpreadsheet },
          { label: 'Analytics', href: campusAdminRoutes.analytics, icon: BarChart3 },
        ],
      },
      {
        title: 'Account',
        items: [{ label: 'My Leave', href: campusAdminRoutes.myLeave, icon: CalendarDays }],
      },
    ],
    commandItems: [],
  };

  return (
    <AppShell config={campusAdminPortal}>
      <AdmissionsLeaveNotificationListener />
      <StaffLeaveStatusBanner statusPath={campusAdminRoutes.myLeave} />
      {children}
    </AppShell>
  );
}
