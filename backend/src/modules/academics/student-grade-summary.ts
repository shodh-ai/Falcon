export type StudentGradeRow = {
  status: string;
  credits: number | string | null;
  grade_points: number | string | null;
};

export function studentGradePoints(row: StudentGradeRow): number | null {
  if (row.status !== 'COMPLETED' && row.status !== 'FAILED') return null;
  if (row.grade_points == null || row.grade_points === '') return null;
  const points = Number(row.grade_points);
  return Number.isFinite(points) && points >= 0 ? points : null;
}

/** Use the exam-cell formula and recorded grade points, never a letter-grade guess.
 * Failed graded courses count toward attempted credits, but not earned credits.
 * Round only the final weighted average, not individual course contributions.
 */
export function calculateStudentGradeSummary(rows: StudentGradeRow[]) {
  let weightedPoints = 0;
  let attemptedCredits = 0;
  let earnedCredits = 0;
  for (const row of rows) {
    const credits = Number(row.credits);
    if (!Number.isFinite(credits) || credits <= 0) continue;
    if (row.status === 'COMPLETED') earnedCredits += credits;
    const points = studentGradePoints(row);
    if (points == null) continue;
    weightedPoints += points * credits;
    attemptedCredits += credits;
  }
  return {
    gpa:
      attemptedCredits > 0
        ? Number((weightedPoints / attemptedCredits).toFixed(2))
        : null,
    attemptedCredits,
    earnedCredits,
  };
}
