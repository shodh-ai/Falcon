export type SafetyConcernType = 'RAGGING' | 'SEXUAL_HARASSMENT';
export type SafetyAccusedType = 'FACULTY' | 'STUDENT' | 'SENIOR' | 'STAFF' | 'OTHER';
export type SafetyConcernStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';

export const CONCERN_TYPES = [
  { value: 'RAGGING', label: 'Ragging / Bullying' },
  { value: 'SEXUAL_HARASSMENT', label: 'Sexual Harassment' },
] as const;

export const ACCUSED_TYPES = [
  { value: 'FACULTY', label: 'Faculty member' },
  { value: 'STUDENT', label: 'Fellow student' },
  { value: 'SENIOR', label: 'Senior student' },
  { value: 'STAFF', label: 'Staff member' },
  { value: 'OTHER', label: 'Other / not in system' },
] as const;

export interface SafetyConcern {
  concern_id: string;
  concern_type: SafetyConcernType;
  accused_type: SafetyAccusedType;
  accused_user_id: string | null;
  accused_name?: string | null;
  accused_email?: string | null;
  accused_description: string | null;
  incident_description: string;
  incident_location: string | null;
  incident_date: string | null;
  is_hostel_related: boolean;
  evidence_urls: string[];
  status: SafetyConcernStatus;
  routed_to_roles: string[];
  reporter_name?: string;
  reporter_dept_name?: string;
  reviewer_remarks: string | null;
  resolution_summary: string | null;
  accused_notified_at: string | null;
  created_at: string;
  resolved_at: string | null;
}

export function concernTypeLabel(value: string): string {
  return CONCERN_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function accusedTypeLabel(value: string): string {
  return ACCUSED_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function concernStatusLabel(status: SafetyConcernStatus): string {
  switch (status) {
    case 'SUBMITTED':
      return 'Submitted';
    case 'UNDER_REVIEW':
      return 'Under review';
    case 'ESCALATED':
      return 'Escalated';
    case 'RESOLVED':
      return 'Resolved';
    case 'CLOSED':
      return 'Closed';
    default:
      return status;
  }
}

export function proofDocHref(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `/api/uploads/download?path=${encodeURIComponent(url)}`;
}

export function formatConcernLoggedAt(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
