export type ExemptionStatus = 'PENDING_HOD' | 'RECOMMENDED' | 'APPROVED' | 'REJECTED';
export type ThresholdStatus = 'PENDING_DEAN' | 'APPROVED' | 'REJECTED';

export const EXEMPTION_REASONS = [
  { value: 'MEDICAL', label: 'Medical / Health' },
  { value: 'ACCIDENT', label: 'Accident' },
  { value: 'INTERNSHIP', label: 'Internship' },
  { value: 'BEREAVEMENT', label: 'Bereavement' },
  { value: 'ELITE_FELLOW', label: 'Elite Fellow (UROP waiver)' },
  { value: 'OTHER', label: 'Other' },
] as const;

export interface AttendanceExemption {
  exemption_id: string;
  student_user_id: string;
  student_name?: string;
  student_email?: string;
  dept_name?: string;
  hod_name?: string;
  reason_category: string;
  description: string;
  supporting_doc_url: string | null;
  attendance_percent_at_request: string | number;
  semester: number | null;
  status: ExemptionStatus;
  hod_remarks: string | null;
  final_remarks: string | null;
  created_at: string;
}

export interface ThresholdRequest {
  request_id: string;
  dept_id: number | null;
  dept_name?: string;
  requested_by_name?: string;
  requested_min_percent: number;
  reason: string;
  status: ThresholdStatus;
  decision_remarks: string | null;
  created_at: string;
}

export function proofDocHref(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `/api/uploads/download?path=${encodeURIComponent(url)}`;
}

export function exemptionStatusLabel(status: ExemptionStatus): string {
  switch (status) {
    case 'PENDING_HOD':
      return 'Pending HOD';
    case 'RECOMMENDED':
      return 'Pending HOD';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    default:
      return status;
  }
}

export function reasonLabel(value: string): string {
  return EXEMPTION_REASONS.find((r) => r.value === value)?.label ?? value;
}
