import {
  Activity,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  Inbox,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { PortalConfig } from "@/lib/navigation";
const overview = {
  label: "Executive Dashboard",
  href: "/principal/dashboard",
  icon: LayoutDashboard,
  shortLabel: "Overview",
};
const department = {
  label: "Department Overview",
  href: "/principal/department",
  icon: BookOpen,
};
const approvals = {
  label: "Approval Centre",
  href: "/principal/inbox",
  icon: Inbox,
  shortLabel: "Approvals",
};
const exceptions = {
  label: "Escalations & Follow-ups",
  href: "/principal/exceptions",
  icon: ClipboardList,
  shortLabel: "Cases",
};
const operations = {
  label: "Academic Operations",
  href: "/principal/operations",
  icon: CalendarDays,
};
const performance = {
  label: "Academic Performance",
  href: "/principal/performance",
  icon: Activity,
};
const workload = {
  label: "Faculty & Workload",
  href: "/principal/workload",
  icon: Users,
  shortLabel: "Workload",
};
const audit = {
  label: "Compliance & Audit",
  href: "/principal/audit",
  icon: ShieldCheck,
};
const reports = {
  label: "Reports",
  href: "/principal/reports",
  icon: FileText,
};
export const principalPortal: PortalConfig = {
  personaLabel: "Principal Workspace",
  personaTitle: "Department Oversight",
  homeHref: overview.href,
  navGroups: [
    {
      title: "Department Oversight",
      items: [overview, department, operations, performance, workload],
    },
    { title: "Decisions & Follow-up", items: [approvals, exceptions] },
    { title: "Assurance", items: [audit, reports] },
  ],
  commandItems: [
    overview,
    department,
    approvals,
    exceptions,
    operations,
    performance,
    workload,
    audit,
    reports,
  ],
  mobileNavItems: [overview, approvals, exceptions, workload],
};
