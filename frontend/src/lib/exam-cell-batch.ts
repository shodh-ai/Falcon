/** Shared batch label format — must match admit-cards and hall-ticket-approvals. */

export type ExamType = 'MID_TERM' | 'END_TERM';

export function buildExamBatchLabel(semester: number | string, examType: ExamType): string {
  const label = examType.replace('_', ' ');
  return `B.Tech Sem ${semester} ${label}`;
}
