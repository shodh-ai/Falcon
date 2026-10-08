export type LeadPriority = 'high' | 'medium' | 'low';

export type CrmLead = {
  lead_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  lead_score: number;
  stage: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown> | null;
};

export type FunnelStage = {
  key: string;
  label: string;
  count: number;
  conversionPct: number;
};

export type PendingWorkItem = {
  id: string;
  label: string;
  count: number;
  href: string;
  tone: 'amber' | 'orange' | 'blue' | 'purple' | 'green';
};

export type RecentAdmissionRow = {
  id: string;
  student: string;
  program: string;
  status: string;
  counsellor: string;
  admissionDate: string;
  lastActivity: string;
};

export type InboxMessage = {
  id: string;
  channel: 'whatsapp' | 'email' | 'website' | 'phone';
  studentName: string;
  preview: string;
  time: string;
  unread: number;
};

export type CounsellorRow = {
  name: string;
  assigned: number;
  converted: number;
  pending: number;
  conversionPct: number;
};

export type ActivityItem = {
  id: string;
  text: string;
  actor: string;
  time: string;
};

export type ChartBar = { label: string; value: number; max: number };

export const STAGE_LABELS: Record<string, string> = {
  RAW_LEAD: 'Raw Lead',
  CONTACTED: 'Contacted',
  APPLICATION_STARTED: 'Application Started',
  DOCUMENT_VERIFICATION: 'Documents Verified',
  FEE_PAID: 'Fee Paid',
  ENROLLED: 'Enrolled',
};

export const FUNNEL_STAGE_KEYS = [
  'RAW_LEAD',
  'CONTACTED',
  'APPLICATION_STARTED',
  'DOCUMENT_VERIFICATION',
  'FEE_PAID',
  'ENROLLED',
] as const;

export const FUNNEL_STAGE_LABELS: Record<string, string> = {
  RAW_LEAD: 'Raw Leads',
  CONTACTED: 'Contacted',
  APPLICATION_STARTED: 'Application Started',
  DOCUMENT_VERIFICATION: 'Documents Verified',
  FEE_PAID: 'Fee Paid',
  ENROLLED: 'Enrolled',
};

export const DEMO_PENDING_WORK: PendingWorkItem[] = [
  { id: 'docs', label: 'Documents Pending', count: 24, href: '/admissions-crm/verifications', tone: 'amber' },
  { id: 'fees', label: 'Fee Payments Pending', count: 11, href: '/admissions-crm/enrolled-students', tone: 'orange' },
  { id: 'counsel', label: 'Counselling Sessions Today', count: 6, href: '/admissions-crm/counseling', tone: 'blue' },
  { id: 'verify', label: 'Verification Requests', count: 9, href: '/admissions-crm/verifications', tone: 'purple' },
  { id: 'approve', label: 'Admission Approvals', count: 4, href: '/admissions-crm/pipeline', tone: 'green' },
];

export const DEMO_RECENT_ADMISSIONS: RecentAdmissionRow[] = [
  {
    id: '1',
    student: 'Rahul Sharma',
    program: 'B.Tech CSE',
    status: 'Documents Pending',
    counsellor: 'Anita Mehta',
    admissionDate: '28 Jul 2026',
    lastActivity: '2h ago',
  },
  {
    id: '2',
    student: 'Priya Singh',
    program: 'MBA',
    status: 'Fee Paid',
    counsellor: 'Vikram Rao',
    admissionDate: '27 Jul 2026',
    lastActivity: '5h ago',
  },
  {
    id: '3',
    student: 'Amit Verma',
    program: 'B.Tech ME',
    status: 'Application Started',
    counsellor: 'Sneha Patel',
    admissionDate: '26 Jul 2026',
    lastActivity: '1d ago',
  },
  {
    id: '4',
    student: 'Neha Kapoor',
    program: 'BBA',
    status: 'Enrolled',
    counsellor: 'Anita Mehta',
    admissionDate: '25 Jul 2026',
    lastActivity: '1d ago',
  },
];

export const DEMO_INBOX: Record<string, InboxMessage[]> = {
  whatsapp: [
    { id: 'w1', channel: 'whatsapp', studentName: 'Rahul Sharma', preview: 'Please share document checklist', time: '10:24 AM', unread: 2 },
    { id: 'w2', channel: 'whatsapp', studentName: 'Kavya Nair', preview: 'Fee receipt uploaded', time: '9:15 AM', unread: 0 },
  ],
  email: [
    { id: 'e1', channel: 'email', studentName: 'Priya Singh', preview: 'Re: MBA admission query', time: 'Yesterday', unread: 1 },
    { id: 'e2', channel: 'email', studentName: 'Arjun Das', preview: 'Application form submitted', time: 'Yesterday', unread: 0 },
  ],
  website: [
    { id: 's1', channel: 'website', studentName: 'Website Lead — B.Tech', preview: 'New enquiry from Jaipur', time: '2h ago', unread: 3 },
  ],
  phone: [
    { id: 'p1', channel: 'phone', studentName: 'Amit Verma', preview: 'Missed call — callback requested', time: '11:40 AM', unread: 1 },
  ],
};

export const INBOX_PREVIEW_LIMIT = 4;

export function buildInboxPreview(
  inbox: Record<string, InboxMessage[]>,
  limit = INBOX_PREVIEW_LIMIT,
): InboxMessage[] {
  return Object.values(inbox)
    .flat()
    .sort((a, b) => b.unread - a.unread)
    .slice(0, limit);
}

export function inboxUnreadTotal(inbox: Record<string, InboxMessage[]>): number {
  return Object.values(inbox).flat().reduce((sum, message) => sum + message.unread, 0);
}

export const INBOX_CHANNEL_LABELS: Record<InboxMessage['channel'], string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  website: 'Website',
  phone: 'Phone',
};

export const DEMO_COUNSELLORS: CounsellorRow[] = [
  { name: 'Anita Mehta', assigned: 42, converted: 18, pending: 24, conversionPct: 43 },
  { name: 'Vikram Rao', assigned: 36, converted: 15, pending: 21, conversionPct: 42 },
  { name: 'Sneha Patel', assigned: 28, converted: 9, pending: 19, conversionPct: 32 },
  { name: 'Rahul Iyer', assigned: 22, converted: 11, pending: 11, conversionPct: 50 },
];

export const DEMO_ACTIVITIES: ActivityItem[] = [
  { id: 'a1', text: 'submitted documents', actor: 'Rahul Sharma', time: '12 min ago' },
  { id: 'a2', text: 'paid admission fee', actor: 'Priya Singh', time: '45 min ago' },
  { id: 'a3', text: 'Offer letter generated', actor: 'System', time: '1h ago' },
  { id: 'a4', text: 'Counsellor assigned', actor: 'Amit Verma', time: '2h ago' },
  { id: 'a5', text: 'Admission approved', actor: 'Neha Kapoor', time: '3h ago' },
];

export const DEMO_TREND: ChartBar[] = [
  { label: 'Jan', value: 120, max: 200 },
  { label: 'Feb', value: 145, max: 200 },
  { label: 'Mar', value: 168, max: 200 },
  { label: 'Apr', value: 190, max: 200 },
  { label: 'May', value: 175, max: 200 },
  { label: 'Jun', value: 210, max: 220 },
];

export const DEMO_ENROLLMENTS: ChartBar[] = [
  { label: 'Jan', value: 42, max: 80 },
  { label: 'Feb', value: 55, max: 80 },
  { label: 'Mar', value: 61, max: 80 },
  { label: 'Apr', value: 72, max: 80 },
  { label: 'May', value: 68, max: 80 },
  { label: 'Jun', value: 79, max: 80 },
];

export const DEMO_FEE_COLLECTION: ChartBar[] = [
  { label: 'Jan', value: 18, max: 30 },
  { label: 'Feb', value: 22, max: 30 },
  { label: 'Mar', value: 24, max: 30 },
  { label: 'Apr', value: 28, max: 30 },
  { label: 'May', value: 26, max: 30 },
  { label: 'Jun', value: 29, max: 30 },
];

export const DEMO_PROGRAM_BARS: ChartBar[] = [
  { label: 'B.Tech CSE', value: 142, max: 180 },
  { label: 'B.Tech ME', value: 98, max: 180 },
  { label: 'MBA', value: 76, max: 180 },
  { label: 'BBA', value: 64, max: 180 },
  { label: 'BCA', value: 52, max: 180 },
  { label: 'M.Tech', value: 38, max: 180 },
];

export function leadMeta(lead: CrmLead, key: string, fallback: string): string {
  const meta = lead.metadata;
  if (meta && typeof meta[key] === 'string' && meta[key]) return meta[key] as string;
  return fallback;
}

export function leadPriority(lead: CrmLead): LeadPriority {
  const raw = leadMeta(lead, 'priority', '');
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  if (lead.lead_score >= 80) return 'high';
  if (lead.lead_score >= 50) return 'medium';
  return 'low';
}

export function formatRelative(iso?: string): string {
  if (!iso) return 'Recently';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function computeFunnel(
  stageCounts: Record<string, number>,
  useDemoWhenEmpty: boolean,
): FunnelStage[] {
  const keys = FUNNEL_STAGE_KEYS;
  const counts = keys.map((k) => stageCounts[k] ?? (useDemoWhenEmpty ? demoStageCount(k) : 0));
  const top = counts[0] || 1;
  return keys.map((key, i) => ({
    key,
    label: FUNNEL_STAGE_LABELS[key] ?? key,
    count: counts[i],
    conversionPct: Math.round((counts[i] / top) * 100),
  }));
}

export function buildPipelineSummary(
  stageCounts: Record<string, number>,
  useDemoWhenEmpty: boolean,
): FunnelStage[] {
  return computeFunnel(stageCounts, useDemoWhenEmpty);
}

function demoStageCount(stage: string): number {
  const map: Record<string, number> = {
    RAW_LEAD: 248,
    CONTACTED: 186,
    APPLICATION_STARTED: 124,
    DOCUMENT_VERIFICATION: 89,
    FEE_PAID: 52,
    ENROLLED: 38,
  };
  return map[stage] ?? 0;
}

export function computeKpis(
  allLeads: CrmLead[],
  stageCounts: Record<string, number>,
  useDemo: boolean,
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newToday = allLeads.filter((l) => l.created_at && new Date(l.created_at) >= today).length;
  const total = allLeads.length;
  const enrolled = stageCounts.ENROLLED ?? 0;
  const appStarted = stageCounts.APPLICATION_STARTED ?? 0;
  const feePaid = stageCounts.FEE_PAID ?? 0;
  const contacted = stageCounts.CONTACTED ?? 0;
  const conversion =
    total > 0 ? Math.round((enrolled / Math.max(total, 1)) * 100) : useDemo ? 15.3 : 0;

  if (useDemo && total === 0) {
    return {
      totalLeads: 248,
      newToday: 12,
      applicationsStarted: 124,
      documentsPending: 24,
      feePaid: 52,
      enrolled: 38,
      counsellingToday: 6,
      conversionRate: 15.3,
    };
  }

  return {
    totalLeads: total,
    newToday: newToday || (useDemo ? 12 : 0),
    applicationsStarted: appStarted,
    documentsPending: Math.max(0, appStarted - feePaid) || (useDemo ? 24 : 0),
    feePaid,
    enrolled,
    counsellingToday: useDemo ? 6 : Math.min(6, contacted),
    conversionRate: conversion,
  };
}
