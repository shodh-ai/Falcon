export const PHD_APPLICATION_TYPES = [
  { value: 'PET', label: 'Apply for PET (entrance test)' },
  { value: 'PET_EXEMPTION', label: 'Apply for PET exemption' },
] as const;

export const PHD_PIPELINE = [
  { key: 'ADMISSION', label: 'Application & Admission' },
  { key: 'REGISTRATION', label: 'Guide & Eligibility' },
  { key: 'PROGRESS', label: 'Progress Monitoring' },
  { key: 'SYNOPSIS', label: 'Synopsis & RRC' },
  { key: 'THESIS', label: 'Thesis Evaluation' },
  { key: 'VIVA', label: 'Viva Voce' },
  { key: 'AWARD', label: 'Degree Award' },
] as const;

export type PhdCandidate = {
  candidate_id: string;
  user_id?: string | null;
  applicant_name?: string | null;
  applicant_email?: string | null;
  application_type: string;
  proposed_topic: string;
  guide_user_id?: string | null;
  guide_name?: string | null;
  candidate_name?: string | null;
  dept_name?: string | null;
  lifecycle_stage: string;
  lifecycle_status: string;
  pending_actor_role?: string | null;
  semester_count?: number;
  fee_paid?: boolean;
  documents_verified?: boolean;
  created_at?: string;
  updated_at?: string;
  submissions?: Array<{
    submission_id: string;
    submission_type: string;
    semester?: number | null;
    status: string;
    notes?: string | null;
    created_at?: string;
  }>;
  decisions?: Array<{
    committee_type: string;
    decision: string;
    remarks?: string | null;
    decided_by_name?: string | null;
    created_at?: string;
  }>;
};

export type PhdEligibility = {
  can_apply: boolean;
  route: 'PG' | 'BTECH_DIRECT' | null;
  route_label: string;
  requires_entrance_proof: boolean;
  reasons: string[];
  requirements: Array<{ label: string; met: boolean; pending?: boolean }>;
  academic: {
    program_label: string | null;
    classification: 'PG' | 'BTECH' | 'OTHER_UG' | 'UNKNOWN';
    latest_semester: number;
    cleared_second_year: boolean;
    cgpa: number | null;
    active_backlogs: number;
    is_masters: boolean;
  };
};

const STATUS_LABELS: Record<string, string> = {
  APPLICATION_SUBMITTED: 'Application submitted',
  APPLICATION_SCRUTINY_RECOMMENDED: 'Scrutiny recommended',
  APPLICATION_SCRUTINY_REJECTED: 'Application rejected',
  PET_EXEMPTED: 'PET exempted',
  PET_PENDING: 'PET pending',
  PET_QUALIFIED: 'PET qualified',
  PET_FAILED: 'PET not qualified',
  DRC_INTERVIEW_PENDING: 'DRC interview pending',
  DRC_SHORTLISTED: 'DRC shortlisted',
  DRC_REJECTED: 'Not shortlisted',
  SUPERVISOR_ALLOCATED: 'Supervisor allocated',
  DOCUMENTS_VERIFIED: 'Documents verified',
  FEES_PAID: 'Fees paid',
  ADMITTED: 'Admitted',
  GUIDE_ALLOCATED: 'Guide allocated',
  GUIDE_ACCEPTANCE_SUBMITTED: 'Guide acceptance submitted',
  GUIDE_ACCEPTANCE_VERIFIED: 'Guide acceptance verified',
  ELIGIBILITY_SUBMITTED: 'Eligibility submitted',
  ELIGIBILITY_VERIFIED: 'Eligibility verified',
  COURSEWORK_SUBMITTED: 'Coursework submitted',
  COURSEWORK_COMPLETED: 'Coursework completed',
  PROGRESS_REPORT_DUE: 'Progress report due / under review',
  PROGRESS_SATISFACTORY: 'Progress satisfactory',
  PROGRESS_UNSATISFACTORY: 'Progress unsatisfactory',
  RAC_SYNOPSIS_RECOMMENDED: 'RAC recommended synopsis',
  RAC_SYNOPSIS_DECLINED: 'Continue progress monitoring',
  REGISTRATION_CANCELLED: 'Registration cancelled',
  SYNOPSIS_SUBMITTED: 'Synopsis submitted',
  SYNOPSIS_ADJUDICATION_PENDING: 'Synopsis with adjudicators',
  SYNOPSIS_APPROVED: 'Synopsis approved',
  THESIS_FORMAT_SUBMITTED: 'Thesis format check',
  THESIS_SUBMITTED: 'Thesis submitted',
  THESIS_EVALUATION_PENDING: 'Thesis evaluation',
  THESIS_RECOMMENDED: 'Thesis recommended',
  THESIS_RESUBMISSION_REQUIRED: 'Thesis resubmission required',
  PRE_VIVA_COMPLETED: 'Pre-viva completed',
  VIVA_VOCE_SCHEDULED: 'Viva voce scheduled',
  VIVA_RECOMMENDED: 'Recommended for degree',
  RE_VIVA_REQUIRED: 'Re-viva required (6 months)',
  BOM_APPROVAL_PENDING: 'Board approval pending',
  BOM_APPROVED: 'Board approved',
  FINAL_THESIS_SUBMITTED: 'Final thesis submitted',
  DEGREE_AWARDED: 'Degree awarded',
};

const ACTION_LABELS: Record<string, string> = {
  SCRUTINY_RECOMMEND: 'Recommend after scrutiny',
  SCRUTINY_REJECT: 'Reject application',
  MARK_PET_EXEMPT: 'Mark PET exempt',
  MARK_PET_REQUIRED: 'Require PET',
  PET_QUALIFY: 'Mark PET qualified',
  PET_FAIL: 'Mark PET failed',
  DRC_SHORTLIST: 'Shortlist after interview',
  DRC_REJECT: 'Reject after interview',
  ALLOCATE_SUPERVISOR: 'Allocate supervisor',
  VERIFY_DOCUMENTS: 'Verify original documents',
  RECORD_FEES: 'Record fee payment',
  ISSUE_ADMISSION: 'Issue admission certificate',
  ALLOCATE_GUIDE: 'Allocate research guide',
  SUBMIT_GUIDE_ACCEPTANCE: 'Submit guide acceptance letter',
  VERIFY_GUIDE_ACCEPTANCE: 'Verify guide acceptance',
  SUBMIT_ELIGIBILITY: 'Submit eligibility form',
  VERIFY_ELIGIBILITY: 'Verify eligibility documents',
  SUBMIT_COURSEWORK: 'Submit coursework completion',
  APPROVE_COURSEWORK: 'Approve coursework',
  SUBMIT_PROGRESS_REPORT: 'Submit semester progress report',
  RAC_PROGRESS_SATISFACTORY: 'Progress satisfactory',
  RAC_PROGRESS_UNSATISFACTORY: 'Progress unsatisfactory',
  RAC_CONTINUE_PROGRAM: 'Allow to continue program',
  RAC_CANCEL_REGISTRATION: 'Cancel registration',
  RAC_RECOMMEND_SYNOPSIS: 'Recommend synopsis meeting',
  RAC_DECLINE_SYNOPSIS: 'Continue progress monitoring',
  SUBMIT_SYNOPSIS: 'Submit synopsis to RRC',
  RRC_FORWARD_SYNOPSIS: 'Forward synopsis to adjudicators',
  ADJUDICATOR_ACCEPT_SYNOPSIS: 'Accept synopsis',
  SUBMIT_THESIS_FORMAT: 'Submit thesis for format check',
  RRC_APPROVE_THESIS_FORMAT: 'Approve thesis format',
  SUBMIT_THESIS: 'Submit thesis for evaluation',
  ADJUDICATOR_RECOMMEND_THESIS: 'Recommend thesis',
  ADJUDICATOR_REQUIRE_RESUBMISSION: 'Require thesis resubmission',
  COMPLETE_PRE_VIVA: 'Complete pre-viva',
  SCHEDULE_VIVA: 'Schedule viva voce',
  VIVA_RECOMMEND_DEGREE: 'Recommend Ph.D. award',
  VIVA_REQUIRE_RE_VIVA: 'Require re-viva (6 months)',
  BOM_APPROVE: 'Board of Management approval',
  SUBMIT_FINAL_THESIS: 'Submit final thesis',
  AWARD_DEGREE: 'Award Ph.D. degree',
};

export function phdStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

export function phdActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

/** Actions available per status for UI (mirrors backend rules). */
export function phdActionsForStatus(status: string, role: string): string[] {
  const map: Record<string, Partial<Record<string, string[]>>> = {
    APPLICATION_SUBMITTED: { DRC_MEMBER: ['SCRUTINY_RECOMMEND', 'SCRUTINY_REJECT'] },
    APPLICATION_SCRUTINY_RECOMMENDED: { DRC_MEMBER: ['MARK_PET_EXEMPT', 'MARK_PET_REQUIRED'] },
    PET_PENDING: { DRC_MEMBER: ['PET_QUALIFY', 'PET_FAIL'] },
    PET_EXEMPTED: { DRC_MEMBER: ['PET_QUALIFY'] },
    PET_QUALIFIED: { DRC_MEMBER: ['DRC_SHORTLIST', 'DRC_REJECT'] },
    DRC_SHORTLISTED: { DRC_MEMBER: ['ALLOCATE_SUPERVISOR'] },
    SUPERVISOR_ALLOCATED: { Registrar: ['VERIFY_DOCUMENTS'] },
    DOCUMENTS_VERIFIED: { Accountant: ['RECORD_FEES'], Registrar: ['RECORD_FEES'] },
    FEES_PAID: { Registrar: ['ISSUE_ADMISSION'] },
    ADMITTED: { RAC_MEMBER: ['ALLOCATE_GUIDE'] },
    GUIDE_ALLOCATED: { Student: ['SUBMIT_GUIDE_ACCEPTANCE'] },
    GUIDE_ACCEPTANCE_SUBMITTED: { Faculty: ['VERIFY_GUIDE_ACCEPTANCE'] },
    GUIDE_ACCEPTANCE_VERIFIED: { Student: ['SUBMIT_ELIGIBILITY'] },
    ELIGIBILITY_SUBMITTED: { RAC_MEMBER: ['VERIFY_ELIGIBILITY'] },
    ELIGIBILITY_VERIFIED: { Student: ['SUBMIT_COURSEWORK'] },
    COURSEWORK_SUBMITTED: { RAC_MEMBER: ['APPROVE_COURSEWORK'] },
    COURSEWORK_COMPLETED: { Student: ['SUBMIT_PROGRESS_REPORT'] },
    PROGRESS_REPORT_DUE: {
      Student: ['SUBMIT_PROGRESS_REPORT'],
      RAC_MEMBER: ['RAC_PROGRESS_SATISFACTORY', 'RAC_PROGRESS_UNSATISFACTORY'],
    },
    PROGRESS_SATISFACTORY: { RAC_MEMBER: ['RAC_RECOMMEND_SYNOPSIS', 'RAC_DECLINE_SYNOPSIS'] },
    PROGRESS_UNSATISFACTORY: { RAC_MEMBER: ['RAC_CONTINUE_PROGRAM', 'RAC_CANCEL_REGISTRATION'] },
    RAC_SYNOPSIS_DECLINED: { Student: ['SUBMIT_PROGRESS_REPORT'] },
    RAC_SYNOPSIS_RECOMMENDED: { Student: ['SUBMIT_SYNOPSIS'] },
    SYNOPSIS_SUBMITTED: { RRC_MEMBER: ['RRC_FORWARD_SYNOPSIS'] },
    SYNOPSIS_ADJUDICATION_PENDING: { PHD_ADJUDICATOR: ['ADJUDICATOR_ACCEPT_SYNOPSIS'] },
    SYNOPSIS_APPROVED: { Student: ['SUBMIT_THESIS_FORMAT'] },
    THESIS_FORMAT_SUBMITTED: { RRC_MEMBER: ['RRC_APPROVE_THESIS_FORMAT'] },
    THESIS_SUBMITTED: { Student: ['SUBMIT_THESIS'] },
    THESIS_EVALUATION_PENDING: {
      PHD_ADJUDICATOR: ['ADJUDICATOR_RECOMMEND_THESIS', 'ADJUDICATOR_REQUIRE_RESUBMISSION'],
    },
    THESIS_RESUBMISSION_REQUIRED: { Student: ['SUBMIT_THESIS'] },
    THESIS_RECOMMENDED: { RRC_MEMBER: ['COMPLETE_PRE_VIVA'] },
    PRE_VIVA_COMPLETED: { RRC_MEMBER: ['SCHEDULE_VIVA'] },
    VIVA_VOCE_SCHEDULED: { RRC_MEMBER: ['VIVA_RECOMMEND_DEGREE', 'VIVA_REQUIRE_RE_VIVA'] },
    RE_VIVA_REQUIRED: { RRC_MEMBER: ['SCHEDULE_VIVA'] },
    VIVA_RECOMMENDED: { Dean: ['BOM_APPROVE'], Leadership: ['BOM_APPROVE'], President: ['BOM_APPROVE'] },
    BOM_APPROVED: { Student: ['SUBMIT_FINAL_THESIS'] },
    FINAL_THESIS_SUBMITTED: { Registrar: ['AWARD_DEGREE'], Dean: ['AWARD_DEGREE'] },
  };
  return map[status]?.[role] ?? map[status]?.SuperAdmin ?? [];
}

export function proofDocHref(url: string) {
  if (url.startsWith('http')) return url;
  return url.startsWith('/') ? url : `/api/uploads/download?path=${encodeURIComponent(url)}`;
}
