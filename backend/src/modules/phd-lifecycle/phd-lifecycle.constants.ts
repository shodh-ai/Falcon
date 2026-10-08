export const PHD_APPLICATION_TYPES = ['PET', 'PET_EXEMPTION'] as const;
export type PhdApplicationType = (typeof PHD_APPLICATION_TYPES)[number];

export const PHD_STAGES = [
  'ADMISSION',
  'REGISTRATION',
  'PROGRESS',
  'SYNOPSIS',
  'THESIS',
  'VIVA',
  'AWARD',
  'CLOSED',
] as const;
export type PhdStage = (typeof PHD_STAGES)[number];

export const PHD_STATUSES = [
  'APPLICATION_SUBMITTED',
  'APPLICATION_SCRUTINY_RECOMMENDED',
  'APPLICATION_SCRUTINY_REJECTED',
  'PET_EXEMPTED',
  'PET_PENDING',
  'PET_QUALIFIED',
  'PET_FAILED',
  'DRC_INTERVIEW_PENDING',
  'DRC_SHORTLISTED',
  'DRC_REJECTED',
  'SUPERVISOR_ALLOCATED',
  'DOCUMENTS_VERIFIED',
  'FEES_PAID',
  'ADMITTED',
  'GUIDE_ALLOCATED',
  'GUIDE_ACCEPTANCE_SUBMITTED',
  'GUIDE_ACCEPTANCE_VERIFIED',
  'ELIGIBILITY_SUBMITTED',
  'ELIGIBILITY_VERIFIED',
  'COURSEWORK_SUBMITTED',
  'COURSEWORK_COMPLETED',
  'PROGRESS_REPORT_DUE',
  'PROGRESS_SATISFACTORY',
  'PROGRESS_UNSATISFACTORY',
  'RAC_MEETING_COMPLETED',
  'RAC_SYNOPSIS_RECOMMENDED',
  'RAC_SYNOPSIS_DECLINED',
  'REGISTRATION_CANCELLED',
  'SYNOPSIS_SUBMITTED',
  'SYNOPSIS_ADJUDICATION_PENDING',
  'SYNOPSIS_APPROVED',
  'THESIS_FORMAT_SUBMITTED',
  'THESIS_SUBMITTED',
  'THESIS_EVALUATION_PENDING',
  'THESIS_RECOMMENDED',
  'THESIS_RESUBMISSION_REQUIRED',
  'PRE_VIVA_COMPLETED',
  'VIVA_VOCE_SCHEDULED',
  'VIVA_RECOMMENDED',
  'RE_VIVA_REQUIRED',
  'BOM_APPROVAL_PENDING',
  'BOM_APPROVED',
  'FINAL_THESIS_SUBMITTED',
  'DEGREE_AWARDED',
] as const;
export type PhdStatus = (typeof PHD_STATUSES)[number];

export const PHD_SUBMISSION_TYPES = [
  'GUIDE_ACCEPTANCE',
  'ELIGIBILITY',
  'COURSEWORK',
  'PROGRESS_REPORT',
  'SYNOPSIS',
  'THESIS_DRAFT',
  'THESIS_FINAL',
] as const;

export const COMMITTEE_ROLES = [
  'DRC_MEMBER',
  'RAC_MEMBER',
  'RRC_MEMBER',
  'PHD_ADJUDICATOR',
] as const;

export type PhdAction =
  | 'SCRUTINY_RECOMMEND'
  | 'SCRUTINY_REJECT'
  | 'MARK_PET_EXEMPT'
  | 'MARK_PET_REQUIRED'
  | 'PET_QUALIFY'
  | 'PET_FAIL'
  | 'DRC_SHORTLIST'
  | 'DRC_REJECT'
  | 'ALLOCATE_SUPERVISOR'
  | 'VERIFY_DOCUMENTS'
  | 'RECORD_FEES'
  | 'ISSUE_ADMISSION'
  | 'ALLOCATE_GUIDE'
  | 'SUBMIT_GUIDE_ACCEPTANCE'
  | 'VERIFY_GUIDE_ACCEPTANCE'
  | 'SUBMIT_ELIGIBILITY'
  | 'VERIFY_ELIGIBILITY'
  | 'SUBMIT_COURSEWORK'
  | 'APPROVE_COURSEWORK'
  | 'SUBMIT_PROGRESS_REPORT'
  | 'RAC_PROGRESS_SATISFACTORY'
  | 'RAC_PROGRESS_UNSATISFACTORY'
  | 'RAC_CONTINUE_PROGRAM'
  | 'RAC_CANCEL_REGISTRATION'
  | 'RAC_RECOMMEND_SYNOPSIS'
  | 'RAC_DECLINE_SYNOPSIS'
  | 'SUBMIT_SYNOPSIS'
  | 'RRC_FORWARD_SYNOPSIS'
  | 'ADJUDICATOR_ACCEPT_SYNOPSIS'
  | 'SUBMIT_THESIS_FORMAT'
  | 'RRC_APPROVE_THESIS_FORMAT'
  | 'SUBMIT_THESIS'
  | 'ADJUDICATOR_RECOMMEND_THESIS'
  | 'ADJUDICATOR_REQUIRE_RESUBMISSION'
  | 'COMPLETE_PRE_VIVA'
  | 'SCHEDULE_VIVA'
  | 'VIVA_RECOMMEND_DEGREE'
  | 'VIVA_REQUIRE_RE_VIVA'
  | 'BOM_APPROVE'
  | 'SUBMIT_FINAL_THESIS'
  | 'AWARD_DEGREE';

export interface ActionDef {
  from: PhdStatus[];
  to: PhdStatus;
  stage: PhdStage;
  actorRoles: string[];
  pendingRole: string | null;
  committee?: 'DRC' | 'RAC' | 'RRC' | 'ADJUDICATOR' | 'BOM';
  decision?: string;
  notifyRoles?: string[];
  notifyCandidate?: boolean;
  notifyGuide?: boolean;
}

export const PHD_ACTIONS: Record<PhdAction, ActionDef> = {
  SCRUTINY_RECOMMEND: {
    from: ['APPLICATION_SUBMITTED'],
    to: 'APPLICATION_SCRUTINY_RECOMMENDED',
    stage: 'ADMISSION',
    actorRoles: ['DRC_MEMBER', 'Registrar', 'SuperAdmin'],
    pendingRole: 'DRC_MEMBER',
  },
  SCRUTINY_REJECT: {
    from: ['APPLICATION_SUBMITTED'],
    to: 'APPLICATION_SCRUTINY_REJECTED',
    stage: 'CLOSED',
    actorRoles: ['DRC_MEMBER', 'Registrar', 'SuperAdmin'],
    pendingRole: null,
    committee: 'DRC',
    decision: 'REJECT',
  },
  MARK_PET_EXEMPT: {
    from: ['APPLICATION_SCRUTINY_RECOMMENDED'],
    to: 'PET_EXEMPTED',
    stage: 'ADMISSION',
    actorRoles: ['DRC_MEMBER', 'SuperAdmin'],
    pendingRole: 'DRC_MEMBER',
  },
  MARK_PET_REQUIRED: {
    from: ['APPLICATION_SCRUTINY_RECOMMENDED'],
    to: 'PET_PENDING',
    stage: 'ADMISSION',
    actorRoles: ['DRC_MEMBER', 'SuperAdmin'],
    pendingRole: 'DRC_MEMBER',
  },
  PET_QUALIFY: {
    from: ['PET_PENDING', 'PET_EXEMPTED'],
    to: 'PET_QUALIFIED',
    stage: 'ADMISSION',
    actorRoles: ['DRC_MEMBER', 'SuperAdmin'],
    pendingRole: 'DRC_MEMBER',
    committee: 'DRC',
    decision: 'QUALIFY',
  },
  PET_FAIL: {
    from: ['PET_PENDING'],
    to: 'PET_FAILED',
    stage: 'CLOSED',
    actorRoles: ['DRC_MEMBER', 'SuperAdmin'],
    pendingRole: null,
    committee: 'DRC',
    decision: 'FAIL',
  },
  DRC_SHORTLIST: {
    from: ['PET_QUALIFIED'],
    to: 'DRC_SHORTLISTED',
    stage: 'ADMISSION',
    actorRoles: ['DRC_MEMBER', 'SuperAdmin'],
    pendingRole: 'DRC_MEMBER',
    committee: 'DRC',
    decision: 'SHORTLIST',
  },
  DRC_REJECT: {
    from: ['PET_QUALIFIED'],
    to: 'DRC_REJECTED',
    stage: 'CLOSED',
    actorRoles: ['DRC_MEMBER', 'SuperAdmin'],
    pendingRole: null,
    committee: 'DRC',
    decision: 'REJECT',
  },
  ALLOCATE_SUPERVISOR: {
    from: ['DRC_SHORTLISTED'],
    to: 'SUPERVISOR_ALLOCATED',
    stage: 'ADMISSION',
    actorRoles: ['DRC_MEMBER', 'SuperAdmin'],
    pendingRole: 'Registrar',
    committee: 'DRC',
    decision: 'APPROVE',
  },
  VERIFY_DOCUMENTS: {
    from: ['SUPERVISOR_ALLOCATED'],
    to: 'DOCUMENTS_VERIFIED',
    stage: 'ADMISSION',
    actorRoles: ['Registrar', 'SuperAdmin'],
    pendingRole: 'Accountant',
  },
  RECORD_FEES: {
    from: ['DOCUMENTS_VERIFIED'],
    to: 'FEES_PAID',
    stage: 'ADMISSION',
    actorRoles: ['Accountant', 'Registrar', 'SuperAdmin'],
    pendingRole: 'Registrar',
  },
  ISSUE_ADMISSION: {
    from: ['FEES_PAID'],
    to: 'ADMITTED',
    stage: 'REGISTRATION',
    actorRoles: ['Registrar', 'SuperAdmin'],
    pendingRole: 'RAC_MEMBER',
    notifyRoles: ['RAC_MEMBER'],
  },
  ALLOCATE_GUIDE: {
    from: ['ADMITTED'],
    to: 'GUIDE_ALLOCATED',
    stage: 'REGISTRATION',
    actorRoles: ['RAC_MEMBER', 'SuperAdmin'],
    pendingRole: 'Student',
    committee: 'RAC',
    decision: 'APPROVE',
    notifyGuide: true,
  },
  SUBMIT_GUIDE_ACCEPTANCE: {
    from: ['GUIDE_ALLOCATED'],
    to: 'GUIDE_ACCEPTANCE_SUBMITTED',
    stage: 'REGISTRATION',
    actorRoles: ['Student', 'SuperAdmin'],
    pendingRole: 'Faculty',
  },
  VERIFY_GUIDE_ACCEPTANCE: {
    from: ['GUIDE_ACCEPTANCE_SUBMITTED'],
    to: 'GUIDE_ACCEPTANCE_VERIFIED',
    stage: 'REGISTRATION',
    actorRoles: ['Faculty', 'SuperAdmin'],
    pendingRole: 'Student',
  },
  SUBMIT_ELIGIBILITY: {
    from: ['GUIDE_ACCEPTANCE_VERIFIED'],
    to: 'ELIGIBILITY_SUBMITTED',
    stage: 'REGISTRATION',
    actorRoles: ['Student', 'SuperAdmin'],
    pendingRole: 'RAC_MEMBER',
  },
  VERIFY_ELIGIBILITY: {
    from: ['ELIGIBILITY_SUBMITTED'],
    to: 'ELIGIBILITY_VERIFIED',
    stage: 'REGISTRATION',
    actorRoles: ['RAC_MEMBER', 'SuperAdmin'],
    pendingRole: 'Student',
    committee: 'RAC',
    decision: 'APPROVE',
  },
  SUBMIT_COURSEWORK: {
    from: ['ELIGIBILITY_VERIFIED'],
    to: 'COURSEWORK_SUBMITTED',
    stage: 'REGISTRATION',
    actorRoles: ['Student', 'SuperAdmin'],
    pendingRole: 'RAC_MEMBER',
  },
  APPROVE_COURSEWORK: {
    from: ['COURSEWORK_SUBMITTED'],
    to: 'COURSEWORK_COMPLETED',
    stage: 'PROGRESS',
    actorRoles: ['RAC_MEMBER', 'SuperAdmin'],
    pendingRole: 'Student',
    committee: 'RAC',
    decision: 'APPROVE',
  },
  SUBMIT_PROGRESS_REPORT: {
    from: [
      'COURSEWORK_COMPLETED',
      'PROGRESS_REPORT_DUE',
      'PROGRESS_SATISFACTORY',
      'RAC_SYNOPSIS_DECLINED',
    ],
    to: 'PROGRESS_REPORT_DUE',
    stage: 'PROGRESS',
    actorRoles: ['Student', 'SuperAdmin'],
    pendingRole: 'RAC_MEMBER',
  },
  RAC_PROGRESS_SATISFACTORY: {
    from: ['PROGRESS_REPORT_DUE'],
    to: 'PROGRESS_SATISFACTORY',
    stage: 'PROGRESS',
    actorRoles: ['RAC_MEMBER', 'SuperAdmin'],
    pendingRole: 'RAC_MEMBER',
    committee: 'RAC',
    decision: 'APPROVE',
  },
  RAC_PROGRESS_UNSATISFACTORY: {
    from: ['PROGRESS_REPORT_DUE'],
    to: 'PROGRESS_UNSATISFACTORY',
    stage: 'PROGRESS',
    actorRoles: ['RAC_MEMBER', 'SuperAdmin'],
    pendingRole: 'RAC_MEMBER',
    committee: 'RAC',
    decision: 'REJECT',
  },
  RAC_CONTINUE_PROGRAM: {
    from: ['PROGRESS_UNSATISFACTORY'],
    to: 'PROGRESS_REPORT_DUE',
    stage: 'PROGRESS',
    actorRoles: ['RAC_MEMBER', 'SuperAdmin'],
    pendingRole: 'Student',
    committee: 'RAC',
    decision: 'RECOMMEND',
  },
  RAC_CANCEL_REGISTRATION: {
    from: ['PROGRESS_UNSATISFACTORY'],
    to: 'REGISTRATION_CANCELLED',
    stage: 'CLOSED',
    actorRoles: ['RAC_MEMBER', 'SuperAdmin'],
    pendingRole: null,
    committee: 'RAC',
    decision: 'REJECT',
  },
  RAC_RECOMMEND_SYNOPSIS: {
    from: ['PROGRESS_SATISFACTORY', 'RAC_MEETING_COMPLETED'],
    to: 'RAC_SYNOPSIS_RECOMMENDED',
    stage: 'SYNOPSIS',
    actorRoles: ['RAC_MEMBER', 'SuperAdmin'],
    pendingRole: 'Student',
    committee: 'RAC',
    decision: 'RECOMMEND_SYNOPSIS',
  },
  RAC_DECLINE_SYNOPSIS: {
    from: ['PROGRESS_SATISFACTORY'],
    to: 'RAC_SYNOPSIS_DECLINED',
    stage: 'PROGRESS',
    actorRoles: ['RAC_MEMBER', 'SuperAdmin'],
    pendingRole: 'Student',
    committee: 'RAC',
    decision: 'REJECT',
  },
  SUBMIT_SYNOPSIS: {
    from: ['RAC_SYNOPSIS_RECOMMENDED'],
    to: 'SYNOPSIS_SUBMITTED',
    stage: 'SYNOPSIS',
    actorRoles: ['Student', 'SuperAdmin'],
    pendingRole: 'RRC_MEMBER',
  },
  RRC_FORWARD_SYNOPSIS: {
    from: ['SYNOPSIS_SUBMITTED'],
    to: 'SYNOPSIS_ADJUDICATION_PENDING',
    stage: 'SYNOPSIS',
    actorRoles: ['RRC_MEMBER', 'SuperAdmin'],
    pendingRole: 'PHD_ADJUDICATOR',
    committee: 'RRC',
    decision: 'APPROVE',
  },
  ADJUDICATOR_ACCEPT_SYNOPSIS: {
    from: ['SYNOPSIS_ADJUDICATION_PENDING'],
    to: 'SYNOPSIS_APPROVED',
    stage: 'THESIS',
    actorRoles: ['PHD_ADJUDICATOR', 'SuperAdmin'],
    pendingRole: 'Student',
    committee: 'ADJUDICATOR',
    decision: 'APPROVE',
  },
  SUBMIT_THESIS_FORMAT: {
    from: ['SYNOPSIS_APPROVED'],
    to: 'THESIS_FORMAT_SUBMITTED',
    stage: 'THESIS',
    actorRoles: ['Student', 'SuperAdmin'],
    pendingRole: 'RRC_MEMBER',
  },
  RRC_APPROVE_THESIS_FORMAT: {
    from: ['THESIS_FORMAT_SUBMITTED'],
    to: 'THESIS_SUBMITTED',
    stage: 'THESIS',
    actorRoles: ['RRC_MEMBER', 'SuperAdmin'],
    pendingRole: 'PHD_ADJUDICATOR',
    committee: 'RRC',
    decision: 'APPROVE',
  },
  SUBMIT_THESIS: {
    from: ['THESIS_SUBMITTED'],
    to: 'THESIS_EVALUATION_PENDING',
    stage: 'THESIS',
    actorRoles: ['Student', 'SuperAdmin'],
    pendingRole: 'PHD_ADJUDICATOR',
  },
  ADJUDICATOR_RECOMMEND_THESIS: {
    from: ['THESIS_EVALUATION_PENDING'],
    to: 'THESIS_RECOMMENDED',
    stage: 'VIVA',
    actorRoles: ['PHD_ADJUDICATOR', 'SuperAdmin'],
    pendingRole: 'RRC_MEMBER',
    committee: 'ADJUDICATOR',
    decision: 'RECOMMEND',
  },
  ADJUDICATOR_REQUIRE_RESUBMISSION: {
    from: ['THESIS_EVALUATION_PENDING'],
    to: 'THESIS_RESUBMISSION_REQUIRED',
    stage: 'THESIS',
    actorRoles: ['PHD_ADJUDICATOR', 'SuperAdmin'],
    pendingRole: 'Student',
    committee: 'ADJUDICATOR',
    decision: 'RESUBMIT',
  },
  COMPLETE_PRE_VIVA: {
    from: ['THESIS_RECOMMENDED'],
    to: 'PRE_VIVA_COMPLETED',
    stage: 'VIVA',
    actorRoles: ['RRC_MEMBER', 'SuperAdmin'],
    pendingRole: 'RRC_MEMBER',
  },
  SCHEDULE_VIVA: {
    from: ['PRE_VIVA_COMPLETED', 'RE_VIVA_REQUIRED'],
    to: 'VIVA_VOCE_SCHEDULED',
    stage: 'VIVA',
    actorRoles: ['RRC_MEMBER', 'SuperAdmin'],
    pendingRole: 'RRC_MEMBER',
  },
  VIVA_RECOMMEND_DEGREE: {
    from: ['VIVA_VOCE_SCHEDULED'],
    to: 'VIVA_RECOMMENDED',
    stage: 'VIVA',
    actorRoles: ['RRC_MEMBER', 'SuperAdmin'],
    pendingRole: 'Dean',
    committee: 'RRC',
    decision: 'RECOMMEND_DEGREE',
  },
  VIVA_REQUIRE_RE_VIVA: {
    from: ['VIVA_VOCE_SCHEDULED'],
    to: 'RE_VIVA_REQUIRED',
    stage: 'VIVA',
    actorRoles: ['RRC_MEMBER', 'SuperAdmin'],
    pendingRole: 'RRC_MEMBER',
    committee: 'RRC',
    decision: 'REJECT',
  },
  BOM_APPROVE: {
    from: ['VIVA_RECOMMENDED'],
    to: 'BOM_APPROVED',
    stage: 'AWARD',
    actorRoles: ['Dean', 'Leadership', 'President', 'SuperAdmin'],
    pendingRole: 'Student',
    committee: 'BOM',
    decision: 'APPROVE',
  },
  SUBMIT_FINAL_THESIS: {
    from: ['BOM_APPROVED'],
    to: 'FINAL_THESIS_SUBMITTED',
    stage: 'AWARD',
    actorRoles: ['Student', 'SuperAdmin'],
    pendingRole: 'Registrar',
  },
  AWARD_DEGREE: {
    from: ['FINAL_THESIS_SUBMITTED'],
    to: 'DEGREE_AWARDED',
    stage: 'AWARD',
    actorRoles: ['Registrar', 'Dean', 'SuperAdmin'],
    pendingRole: null,
    notifyCandidate: true,
  },
};

export const PHD_PIPELINE_STEPS = [
  {
    stage: 'ADMISSION',
    label: 'Application & Admission',
    statuses: [
      'APPLICATION_SUBMITTED',
      'PET_QUALIFIED',
      'DRC_SHORTLISTED',
      'ADMITTED',
    ],
  },
  {
    stage: 'REGISTRATION',
    label: 'Guide & Eligibility',
    statuses: [
      'GUIDE_ALLOCATED',
      'GUIDE_ACCEPTANCE_VERIFIED',
      'ELIGIBILITY_VERIFIED',
      'COURSEWORK_COMPLETED',
    ],
  },
  {
    stage: 'PROGRESS',
    label: 'Progress Monitoring',
    statuses: [
      'PROGRESS_REPORT_DUE',
      'PROGRESS_SATISFACTORY',
      'RAC_SYNOPSIS_RECOMMENDED',
    ],
  },
  {
    stage: 'SYNOPSIS',
    label: 'Synopsis & RRC',
    statuses: ['SYNOPSIS_SUBMITTED', 'SYNOPSIS_APPROVED'],
  },
  {
    stage: 'THESIS',
    label: 'Thesis Evaluation',
    statuses: ['THESIS_SUBMITTED', 'THESIS_RECOMMENDED'],
  },
  {
    stage: 'VIVA',
    label: 'Viva Voce',
    statuses: ['VIVA_VOCE_SCHEDULED', 'VIVA_RECOMMENDED'],
  },
  {
    stage: 'AWARD',
    label: 'Degree Award',
    statuses: ['BOM_APPROVED', 'DEGREE_AWARDED'],
  },
] as const;

export function actionsForRole(role: string, status: PhdStatus): PhdAction[] {
  const normalized = role === 'HoD' ? 'HOD' : role;
  return (Object.entries(PHD_ACTIONS) as [PhdAction, ActionDef][])
    .filter(
      ([, def]) =>
        def.from.includes(status) && def.actorRoles.includes(normalized),
    )
    .map(([action]) => action);
}
