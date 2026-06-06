/** Map HR workflow statuses to pill tones for tables and cards. */
export type HrStatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const SUCCESS = new Set([
  'ACTIVE',
  'APPROVED',
  'HR_APPROVED',
  'PUBLISHED',
  'FULL_DAY',
  'ON',
  'COMPLETED',
]);

const WARNING = new Set([
  'PENDING',
  'IN_PROGRESS',
  'HOD_APPROVED',
  'PENDING_HOD_APPROVAL',
  'PENDING_REQUEST',
  'DRAFT',
  'HALF_DAY',
]);

const DANGER = new Set([
  'INACTIVE',
  'REJECTED',
  'ABSENT',
  'OFF',
  'LOP',
  'CANCELLED',
]);

export function hrStatusTone(status: string | boolean | null | undefined): HrStatusTone {
  if (typeof status === 'boolean') return status ? 'success' : 'danger';
  const key = String(status ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (SUCCESS.has(key)) return 'success';
  if (WARNING.has(key)) return 'warning';
  if (DANGER.has(key)) return 'danger';
  return 'neutral';
}

export function hrStatusLabel(status: string | boolean): string {
  if (typeof status === 'boolean') return status ? 'Active' : 'Inactive';
  return status.replace(/_/g, ' ');
}
