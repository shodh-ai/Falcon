/** Universal DOFA case status constants (avoid magic strings). */
export const DOFA_STATUS = {
  OPEN: 'OPEN',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ESCALATED: 'ESCALATED',
} as const;

export type DofaStatus = (typeof DOFA_STATUS)[keyof typeof DOFA_STATUS];

export const DOFA_DECISION = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
