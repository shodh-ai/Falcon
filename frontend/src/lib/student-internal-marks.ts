export type AssessmentMark = {
  key: string;
  label: string;
  marks_obtained: number | string | null;
  max_marks: number | string | null;
};

export type NormalizedAssessmentMark = AssessmentMark & {
  obtained: number | null;
  maximum: number | null;
  valid: boolean;
};

function numericMark(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function formatAssessmentNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function summarizeInternalMarks(components: AssessmentMark[] | null | undefined) {
  const internal: NormalizedAssessmentMark[] = [];
  const endTerm: NormalizedAssessmentMark[] = [];
  for (const component of components ?? []) {
    const obtained = numericMark(component.marks_obtained);
    const maximum = numericMark(component.max_marks);
    const row = {
      ...component,
      obtained,
      maximum,
      valid: obtained != null && maximum != null && maximum > 0 && obtained <= maximum,
    };
    // These are the existing marks-history API's end-term component identifiers.
    (/^(END_TERM|ETE)(-|$)/i.test(component.key) ? endTerm : internal).push(row);
  }
  const recorded = internal.filter((row) => row.valid);
  const obtained = recorded.length ? recorded.reduce((sum, row) => sum + row.obtained!, 0) : null;
  const maximum = recorded.length ? recorded.reduce((sum, row) => sum + row.maximum!, 0) : null;
  return {
    internal,
    endTerm,
    obtained,
    maximum,
    percentage: obtained != null && maximum != null ? Number(((obtained / maximum) * 100).toFixed(2)) : null,
    recordedCount: recorded.length,
    excludedCount: internal.length - recorded.length,
  };
}
