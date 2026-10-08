/** Shared formatters for exam-cell tables — safe rendering of API JSON fields. */

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : value ? [value] : [];
    } catch {
      return value.trim() ? [value] : [];
    }
  }
  return [];
}

export function formatStringList(value: unknown, separator = ', '): string {
  const items = parseStringArray(value);
  return items.length > 0 ? items.join(separator) : '—';
}

export function formatFacilities(facilities: unknown): string {
  if (facilities == null) return '—';
  if (typeof facilities === 'string') return facilities.trim() || '—';
  if (typeof facilities === 'object' && !Array.isArray(facilities)) {
    const labels = Object.entries(facilities as Record<string, unknown>)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key.replace(/_/g, ' '));
    return labels.length > 0 ? labels.join(', ') : '—';
  }
  return '—';
}

type WorkflowStep = { role?: string; action?: string; step?: number };

export function formatWorkflowSteps(steps: unknown): string {
  if (!Array.isArray(steps) || steps.length === 0) return '—';
  return steps
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        const step = entry as WorkflowStep;
        return step.role ?? step.action ?? `Step ${step.step ?? ''}`.trim();
      }
      return String(entry);
    })
    .filter(Boolean)
    .join(' → ');
}

export function normalizeFacultyPerformance(
  rows: Array<Record<string, unknown>>,
): Array<{ name: string; submissions: number }> {
  return rows.map((row) => ({
    name: String(row.name ?? row.faculty_name ?? 'Faculty'),
    submissions: Number(row.submissions ?? row.papers_evaluated ?? 0),
  }));
}
