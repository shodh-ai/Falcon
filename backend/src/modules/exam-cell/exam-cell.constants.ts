/** Roles that may access the Examination Cell workspace APIs. */
export const EXAM_CELL_ACCESS_ROLES = [
  'ExamCell',
  'SuperAdmin',
  'DeputyCOE',
  'ExamAdmin',
  'ExamOperator',
] as const;

export type ExamCellAccessRole = (typeof EXAM_CELL_ACCESS_ROLES)[number];
