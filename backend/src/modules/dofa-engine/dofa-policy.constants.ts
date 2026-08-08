/** Policy Vault status / action constants (avoid magic strings). */
export const POLICY_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_CFO: 'PENDING_CFO',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export type PolicyStatus = (typeof POLICY_STATUS)[keyof typeof POLICY_STATUS];

export const POLICY_AUDIT_ACTION = {
  PROPOSE: 'PROPOSE',
  SUBMIT: 'SUBMIT',
  UNLOCK: 'UNLOCK',
  REJECT: 'REJECT',
  PUBLISH: 'PUBLISH',
  VIEW: 'VIEW',
} as const;

export const POLICY_PROPOSE_ROLES = [
  'CampusAdmin',
  'SuperAdmin',
  'CIO',
] as const;

export const POLICY_READ_ROLES = [
  'CampusAdmin',
  'SuperAdmin',
  'CIO',
  'CFO',
  'Chairman',
  'President',
  'InternalAuditor',
] as const;

export const POLICY_UNLOCK_ROLES = ['CFO'] as const;

export const POLICY_AUDIT_ROLES = [
  'Chairman',
  'President',
  'CFO',
  'InternalAuditor',
  'SuperAdmin',
  'CampusAdmin',
] as const;
