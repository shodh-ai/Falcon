type SemesterGpa = {
  sgpa: number | string | null;
  credits_attempted?: number;
  courses?: Array<{
    credits: number | string;
    grade?: string | null;
    grade_points?: number | string | null;
    status: string;
  }>;
};

function nonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Keep the API's credit-weighted GPA, but distinguish an ungraded term from a failed 0.00. */
export function getSemesterGpa(semester: SemesterGpa | null | undefined): number | null {
  if (!semester) return null;
  const gpa = nonNegativeNumber(semester.sgpa);
  if (gpa == null) return null;

  if (semester.credits_attempted !== undefined) {
    return (nonNegativeNumber(semester.credits_attempted) ?? 0) > 0 ? gpa : null;
  }

  // Older history responses omit attempted credits and per-course grade points.
  const hasGradedCourse = semester.courses?.some((course) => {
    if ((nonNegativeNumber(course.credits) ?? 0) <= 0) return false;
    if (!['PASS', 'FAIL', 'COMPLETED', 'FAILED'].includes(course.status.toUpperCase())) return false;
    if (course.grade_points !== undefined) return nonNegativeNumber(course.grade_points) != null;
    const grade = course.grade?.trim().toUpperCase();
    return !!grade && !['-', '—', 'N/A', 'NA', 'PENDING', 'NOT GRADED', 'IN PROGRESS'].includes(grade);
  });
  return hasGradedCourse ? gpa : null;
}
