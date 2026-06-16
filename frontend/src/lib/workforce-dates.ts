export const WORKFORCE_RETROACTIVE_DAYS = 3;

/** Earliest selectable date for leave / OD / regularization (today minus 3 days). */
export function workforceMinDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - WORKFORCE_RETROACTIVE_DAYS);
  return d.toISOString().slice(0, 10);
}

export function workforceDateInputProps(requestType: string): { min?: string } {
  if (['LEAVE', 'ON_DUTY', 'REGULARIZATION'].includes(requestType)) {
    return { min: workforceMinDate() };
  }
  return {};
}

/** Parse API date or ISO timestamp to local Date (midday to avoid TZ drift). */
export function parseWorkforceDate(value: string): Date | null {
  if (!value) return null;
  if (value.length >= 10 && value[4] === '-' && value[7] === '-') {
    const d = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatWorkforceDate(value: string): string {
  const d = parseWorkforceDate(value);
  if (!d) return value.slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatWorkforceDateRange(start: string, end: string): string {
  const a = parseWorkforceDate(start);
  const b = parseWorkforceDate(end);
  if (!a || !b) return `${start} – ${end}`;
  const sameDay = a.toDateString() === b.toDateString();
  if (sameDay) return formatWorkforceDate(start);
  return `${formatWorkforceDate(start)} – ${formatWorkforceDate(end)}`;
}

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  CL: 'Casual leave',
  SL: 'Sick leave',
  EL: 'Earned leave',
  PL: 'Privilege leave',
  COMP_OFF: 'Comp-off',
  REG: 'Regularisation',
  OD: 'On duty',
  ON_DUTY: 'On duty',
};

export function leaveTypeLabel(type: string): string {
  return LEAVE_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}

export function leaveStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\bHR\b/g, 'HR').trim();
}
