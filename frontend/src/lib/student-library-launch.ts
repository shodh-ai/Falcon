/**
 * Student Library stays in Coming Soon mode until the student-facing OPAC is
 * deliberately launched. This public flag is evaluated when the frontend is
 * built, so changing it requires a frontend rebuild/redeploy.
 */
export function isStudentLibraryLaunched(): boolean {
  const flag = process.env.NEXT_PUBLIC_STUDENT_LIBRARY_LAUNCHED
    ?.trim()
    .toLowerCase();

  return flag === 'true' || flag === '1' || flag === 'on';
}

export function isStudentLibraryLoanDue(
  loan: { status?: string; due_date?: string },
  now = Date.now(),
): boolean {
  if (String(loan.status ?? '').toUpperCase() === 'OVERDUE') return true;
  if (!loan.due_date) return false;

  const dueAt = new Date(loan.due_date).getTime();
  return Number.isFinite(dueAt) && dueAt <= now;
}
