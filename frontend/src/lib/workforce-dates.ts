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
