export const PLACEMENT_PIPELINE_STAGES = [
  'APPLIED',
  'APTITUDE_CLEARED',
  'TECH_INTERVIEW',
  'HR_INTERVIEW',
  'OFFERED',
  'REJECTED',
] as const;

export type PlacementPipelineStage = (typeof PLACEMENT_PIPELINE_STAGES)[number];

/** Kanban columns shown to the Placement Officer (HR maps to HR_INTERVIEW stage). */
export const PLACEMENT_KANBAN_COLUMNS: PlacementPipelineStage[] = [
  'APPLIED',
  'APTITUDE_CLEARED',
  'TECH_INTERVIEW',
  'HR_INTERVIEW',
  'OFFERED',
  'REJECTED',
];

export const PLACEMENT_STAGE_LABELS: Record<PlacementPipelineStage, string> = {
  APPLIED: 'Applied',
  APTITUDE_CLEARED: 'Aptitude Cleared',
  TECH_INTERVIEW: 'Tech Round',
  HR_INTERVIEW: 'HR Round',
  OFFERED: 'Offered',
  REJECTED: 'Rejected',
};

/** Student tracker steps (excludes REJECTED terminal state). */
export const PLACEMENT_TRACKER_STEPS: PlacementPipelineStage[] = [
  'APPLIED',
  'APTITUDE_CLEARED',
  'TECH_INTERVIEW',
  'HR_INTERVIEW',
  'OFFERED',
];

/** University policy: offers above this LPA lock lower-tier drives. */
export const PLACEMENT_TIER1_LPA_THRESHOLD = 5;

export const PLACEMENT_DRIVE_STATUSES = [
  'ACTIVE',
  'CLOSED',
  'COMPLETED',
] as const;
