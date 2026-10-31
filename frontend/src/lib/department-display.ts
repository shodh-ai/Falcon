const PHARMACY_ALIASES = new Set(['pharmacy', 'pharmacy dept', 'pharmacy department', 'department of pharmacy', 'school of pharmacy', 'gyan vihar school of pharmacy']);
export function departmentDisplayName(value: string | null | undefined): string {
  if (!value) return '';
  return PHARMACY_ALIASES.has(value.trim().toLowerCase().replace(/\.$/, '')) ? 'Gyan Vihar School of Pharmacy' : value;
}
/** Presentation only: IDs, membership, course titles and audit payloads stay intact. */
export function normalizeDepartmentLabels<T>(data: T): T {
  if (Array.isArray(data)) return data.map(normalizeDepartmentLabels) as T;
  if (!data || typeof data !== 'object') return data;
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
    ['before_data', 'after_data', 'audit', 'details', 'snapshot'].includes(key) ? value :
      ['department', 'dept_name', 'department_name'].includes(key) && typeof value === 'string'
        ? departmentDisplayName(value) : normalizeDepartmentLabels(value),
  ])) as T;
}
