export type GradeBand = {
  minPercent: number;
  maxPercent: number;
  grade: string;
  gradePoints: number;
};

const DEFAULT_BANDS: GradeBand[] = [
  { minPercent: 90, maxPercent: 100, grade: 'A+', gradePoints: 10 },
  { minPercent: 80, maxPercent: 89.99, grade: 'A', gradePoints: 9 },
  { minPercent: 70, maxPercent: 79.99, grade: 'B+', gradePoints: 8 },
  { minPercent: 60, maxPercent: 69.99, grade: 'B', gradePoints: 7 },
  { minPercent: 50, maxPercent: 59.99, grade: 'C', gradePoints: 6 },
  { minPercent: 40, maxPercent: 49.99, grade: 'D', gradePoints: 5 },
  { minPercent: 0, maxPercent: 39.99, grade: 'F', gradePoints: 0 },
];

export function parseGradeBands(
  rules: Record<string, unknown> | null | undefined,
): GradeBand[] {
  const raw = rules?.bands ?? rules?.gradeBands ?? rules?.grades;
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_BANDS;
  const bands = raw
    .map((row: Record<string, unknown>) => ({
      minPercent: Number(row.minPercent ?? row.min_percent ?? 0),
      maxPercent: Number(row.maxPercent ?? row.max_percent ?? 100),
      grade: String(row.grade ?? 'F'),
      gradePoints: Number(row.gradePoints ?? row.grade_points ?? 0),
    }))
    .filter(
      (b) => Number.isFinite(b.minPercent) && Number.isFinite(b.maxPercent),
    );
  return bands.length
    ? bands.sort((a, b) => b.minPercent - a.minPercent)
    : DEFAULT_BANDS;
}

export function computeGradeFromPercent(
  percent: number,
  bands: GradeBand[],
): { grade: string; gradePoints: number } {
  const p = Math.max(0, Math.min(100, percent));
  for (const band of bands) {
    if (p >= band.minPercent && p <= band.maxPercent) {
      return { grade: band.grade, gradePoints: band.gradePoints };
    }
  }
  const fail =
    bands.find((b) => b.grade === 'F') ??
    DEFAULT_BANDS[DEFAULT_BANDS.length - 1];
  return { grade: fail.grade, gradePoints: fail.gradePoints };
}

export function computePassFail(
  marksObtained: number,
  maxMarks: number,
  passMarks: number | null,
): 'PASS' | 'FAIL' {
  const passThreshold = passMarks ?? maxMarks * 0.4;
  return marksObtained >= passThreshold ? 'PASS' : 'FAIL';
}
