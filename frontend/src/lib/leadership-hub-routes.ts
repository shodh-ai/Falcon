import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  Contact,
  GraduationCap,
  Heart,
  Landmark,
  LineChart,
  Megaphone,
  PieChart,
  ScrollText,
  Settings,
  Shield,
  Target,
  TrendingUp,
  Users,
  Video,
  Wallet,
  ClipboardList,
  FileLock,
} from 'lucide-react';

export type LeadershipHubId = 'dashboard' | 'approvals' | 'financials' | 'academics' | 'reports' | 'vault';

export type LeadershipHubRoute = {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  keywords?: string[];
  requiresFinanceModule?: boolean;
};

export type LeadershipHubSection = {
  title: string;
  description?: string;
  routes: LeadershipHubRoute[];
};

export const LEADERSHIP_DASHBOARD_QUICK_LINKS: LeadershipHubRoute[] = [
  {
    label: 'Financials',
    href: '/leadership/financial-oversight',
    icon: Landmark,
    description: 'Treasury, budget utilization, waivers, and audit shield',
    keywords: ['finance', 'budget', 'cash'],
  },
  {
    label: 'Academics',
    href: '/leadership/academics',
    icon: GraduationCap,
    description: 'Attendance, NAAC, placements, and pillar analytics',
    keywords: ['academic', 'attendance', 'naac'],
  },
  {
    label: 'Approvals',
    href: '/leadership/approvals',
    icon: CheckSquare,
    description: 'Budget, finance, waiver, HR, and academic sign-offs',
    keywords: ['inbox', 'approve', 'workflow'],
  },
];

export const LEADERSHIP_ACTION_ROUTES: LeadershipHubRoute[] = [
  {
    label: 'Action Center',
    href: '/leadership/action-center',
    icon: Target,
    description: 'Executive command hub for tasks, memos, and broadcasts',
    keywords: ['action', 'control', 'hub'],
  },
  {
    label: 'Task Delegation',
    href: '/leadership/tasks',
    icon: ClipboardList,
    description: 'Assign and track delegated executive tasks',
    keywords: ['tasks', 'delegate', 'assign'],
  },
  {
    label: 'Confidential Memos',
    href: '/leadership/memos',
    icon: ScrollText,
    description: 'Chairman directives and confidential communications',
    keywords: ['memo', 'directive', 'confidential'],
  },
  {
    label: 'Broadcasts',
    href: '/leadership/broadcasts',
    icon: Megaphone,
    description: 'Campus-wide executive announcements',
    keywords: ['broadcast', 'announce', 'message'],
  },
  {
    label: 'Board Meetings',
    href: '/leadership/meetings',
    icon: Video,
    description: 'Schedule meetings, agendas, and minutes',
    keywords: ['meeting', 'board', 'agenda'],
  },
  {
    label: 'Strategy Forecast',
    href: '/leadership/forecasting',
    icon: TrendingUp,
    description: 'Scenario planning and strategic projections',
    keywords: ['forecast', 'strategy', 'scenario'],
  },
];

export const LEADERSHIP_FINANCE_ROUTES: LeadershipHubRoute[] = [
  {
    label: 'Financial Oversight',
    href: '/leadership/financial-oversight',
    icon: Landmark,
    description: '7-section macro budget, revenue, expenses, and audit dashboard',
    keywords: ['oversight', 'treasury', 'macro budget'],
  },
  {
    label: 'Cash Flow & P&L',
    href: '/leadership/finance',
    icon: Wallet,
    description: 'Sankey, waterfall, and cash flow deep dive',
    keywords: ['cash flow', 'p&l', 'sankey'],
    requiresFinanceModule: true,
  },
  {
    label: 'Budget Allocation',
    href: '/leadership/budget-allocation',
    icon: Banknote,
    description: 'Department-wise FP&A allocation and reappropriation',
    keywords: ['allocate', 'fpa', 'department budget'],
    requiresFinanceModule: true,
  },
  {
    label: 'Budget Monitor',
    href: '/leadership/budget-monitor',
    icon: BarChart3,
    description: 'Utilization drill-down, encumbrance, and program tracking',
    keywords: ['monitor', 'utilization', 'sankey'],
    requiresFinanceModule: true,
  },
  {
    label: 'Finance Config',
    href: '/leadership/finance-config',
    icon: Settings,
    description: 'Allocation rules, bank snapshot, and waterfall settings',
    keywords: ['config', 'rules', 'waterfall'],
    requiresFinanceModule: true,
  },
  {
    label: 'Versus Analytics',
    href: '/leadership/versus',
    icon: LineChart,
    description: 'MoM, YoY variance, scatter plots, and ratio analysis',
    keywords: ['versus', 'variance', 'comparative'],
    requiresFinanceModule: true,
  },
];

export const LEADERSHIP_ACADEMICS_ROUTES: LeadershipHubRoute[] = [
  {
    label: 'Admissions Funnel',
    href: '/leadership/admissions-funnel',
    icon: TrendingUp,
    description: 'Leads, applications, enrolled, and conversion rates',
    keywords: ['admissions', 'funnel', 'enrollment'],
  },
  {
    label: 'Academic Health',
    href: '/leadership/academics',
    icon: GraduationCap,
    description: 'School-wise pass/fail, attendance, IQAC, and NAAC metrics',
    keywords: ['academics', 'attendance', 'naac'],
  },
  {
    label: 'Placements',
    href: '/leadership/placements',
    icon: Briefcase,
    description: 'Placement rates, LPA trends, and company heatmaps',
    keywords: ['placements', 'lpa', 'jobs'],
  },
  {
    label: 'Result Insights',
    href: '/leadership/insights',
    icon: PieChart,
    description: 'Grade distribution and academic outcome analytics',
    keywords: ['results', 'grades', 'insights'],
  },
  {
    label: 'HR & Payroll Economics',
    href: '/leadership/hr-ops',
    icon: Users,
    description: 'Payroll cost, attrition, and faculty-student ratios',
    keywords: ['hr', 'payroll', 'attrition'],
  },
  {
    label: 'Alumni & Fundraising',
    href: '/leadership/alumni',
    icon: Heart,
    description: 'Alumni engagement, donations, and endowment pipeline',
    keywords: ['alumni', 'fundraising', 'donations'],
  },
  {
    label: 'Infrastructure & Assets',
    href: '/leadership/infrastructure',
    icon: Building2,
    description: 'Hostel occupancy, assets, and maintenance backlog',
    keywords: ['infrastructure', 'hostel', 'assets'],
  },
  {
    label: 'Grievances Escalation',
    href: '/leadership/issues',
    icon: AlertTriangle,
    description: 'SLA breaches, compliance flags, and escalated issues',
    keywords: ['grievances', 'sla', 'issues'],
  },
  {
    label: 'University Directory',
    href: '/directory',
    icon: Contact,
    description: 'Browse students, faculty, and export 360° profiles',
    keywords: ['directory', 'students', 'faculty'],
  },
];

export const LEADERSHIP_REPORTS_ROUTES: LeadershipHubRoute[] = [
  {
    label: 'Financial Intelligence',
    href: '/leadership/intelligence',
    icon: LineChart,
    description: 'Live ticker, 4-quadrant analytics, AI brief, and campus feed',
    keywords: ['intelligence', 'analytics', 'ticker'],
  },
  {
    label: 'Versus Analytics',
    href: '/leadership/versus',
    icon: BarChart3,
    description: 'Comparative MoM/YoY variance and ratio dashboards',
    keywords: ['versus', 'variance', 'comparative'],
    requiresFinanceModule: true,
  },
  {
    label: 'Strategy Forecast',
    href: '/leadership/forecasting',
    icon: TrendingUp,
    description: 'Scenario planning and strategic projections',
    keywords: ['forecast', 'strategy'],
  },
  {
    label: 'Cash Flow Deep Dive',
    href: '/leadership/finance',
    icon: Wallet,
    description: 'P&L sankey, waterfall, and treasury drill-down',
    keywords: ['cash flow', 'finance deep dive'],
    requiresFinanceModule: true,
  },
];

export const LEADERSHIP_VAULT_ROUTES: LeadershipHubRoute[] = [
  {
    label: 'Document Vault',
    href: '/leadership/vault',
    icon: FileLock,
    description: 'Confidential documents, MoU tracker, and access logs',
    keywords: ['vault', 'documents', 'mou'],
  },
  {
    label: 'Audit Trail',
    href: '/leadership/audit-log',
    icon: Shield,
    description: 'Immutable log of executive actions and document access',
    keywords: ['audit', 'trail', 'log'],
  },
  {
    label: 'VIP & Fundraising CRM',
    href: '/leadership/vip-network',
    icon: Users,
    description: 'Donor relationships, touchpoints, and pledge tracking',
    keywords: ['vip', 'donor', 'crm'],
  },
  {
    label: 'Compliance Calendar',
    href: '/leadership/compliance-calendar',
    icon: Calendar,
    description: 'Regulatory deadlines, filings, and renewal alerts',
    keywords: ['compliance', 'calendar', 'deadlines'],
  },
];

export const LEADERSHIP_HUB_SECTIONS: Record<LeadershipHubId, LeadershipHubSection> = {
  dashboard: {
    title: 'Explore Command Center',
    description: 'Jump to a hub area',
    routes: LEADERSHIP_DASHBOARD_QUICK_LINKS,
  },
  approvals: {
    title: 'Executive Action & Control',
    description: 'Tasks, memos, broadcasts, and strategic tools',
    routes: LEADERSHIP_ACTION_ROUTES,
  },
  financials: {
    title: 'Finance Tools',
    description: 'Budget, treasury, and comparative analytics',
    routes: LEADERSHIP_FINANCE_ROUTES,
  },
  academics: {
    title: 'Analytics Pillars',
    description: 'Admissions through infrastructure — all academic KPIs',
    routes: LEADERSHIP_ACADEMICS_ROUTES,
  },
  reports: {
    title: 'Reports & Analytics',
    description: 'Intelligence platform, forecasting, and deep dives',
    routes: LEADERSHIP_REPORTS_ROUTES,
  },
  vault: {
    title: 'Compliance & Legal',
    description: 'Documents, audit, VIP CRM, and regulatory calendar',
    routes: LEADERSHIP_VAULT_ROUTES,
  },
};

export function getLeadershipHubRoutes(hub: LeadershipHubId): LeadershipHubSection {
  return LEADERSHIP_HUB_SECTIONS[hub];
}
