export const PLACEMENT_PIPELINE_STAGES = [
  'APPLIED',
  'APTITUDE_CLEARED',
  'TECH_INTERVIEW',
  'HR_INTERVIEW',
  'OFFERED',
  'REJECTED',
] as const;

export type PlacementPipelineStage = (typeof PLACEMENT_PIPELINE_STAGES)[number];

export const PLACEMENT_KANBAN_COLUMNS: PlacementPipelineStage[] = [
  'APPLIED',
  'APTITUDE_CLEARED',
  'TECH_INTERVIEW',
  'HR_INTERVIEW',
  'OFFERED',
  'REJECTED',
];

export const PLACEMENT_TRACKER_STEPS: PlacementPipelineStage[] = [
  'APPLIED',
  'APTITUDE_CLEARED',
  'TECH_INTERVIEW',
  'HR_INTERVIEW',
  'OFFERED',
];

export const PLACEMENT_STAGE_LABELS: Record<PlacementPipelineStage, string> = {
  APPLIED: 'Applied',
  APTITUDE_CLEARED: 'Aptitude',
  TECH_INTERVIEW: 'Tech Round',
  HR_INTERVIEW: 'HR',
  OFFERED: 'Offered',
  REJECTED: 'Rejected',
};

export type PlacementEligibility = {
  eligible: boolean;
  cgpa: number;
  backlogs: number;
  min_cgpa: number;
  max_backlogs: number;
  package_lpa: number;
  is_placement_locked: boolean;
  placement_offer_lpa: number | null;
  already_applied: boolean;
  reason: string | null;
};

export type PlacementDrive = {
  drive_id: string;
  company_name: string;
  job_role: string;
  job_profile?: string;
  description?: string;
  package_lpa: string | number;
  min_cgpa: string | number;
  max_active_backlogs?: number;
  deadline?: string;
  drive_date?: string;
  eligibility?: PlacementEligibility;
};

export type PlacementApplication = {
  application_id: string;
  drive_id: string;
  pipeline_stage: PlacementPipelineStage;
  rejected_at_stage?: PlacementPipelineStage | null;
  applied_at: string;
  job_role: string;
  company_name: string;
  package_lpa?: string | number;
};

export type PlacementHub = {
  open_drives: PlacementDrive[];
  my_applications: PlacementApplication[];
  student_cgpa: number;
  student_backlogs: number;
  placement_lock: { locked: boolean; offerLpa: number | null; reason: string | null };
};

export type KanbanApplicant = {
  application_id: string;
  pipeline_stage: PlacementPipelineStage;
  student_user_id: string;
  student_name: string;
  student_email: string;
  enrollment_number?: string;
  student_mobile?: string;
  cgpa_at_apply: string;
  resume_file_path?: string;
  applied_at: string;
};

export type KanbanPipeline = {
  drive_id: string;
  columns: Record<PlacementPipelineStage, KanbanApplicant[]>;
  stages: PlacementPipelineStage[];
};
