const ROMAN_SEMESTER: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
};

export function parseAllocationSemester(semester: string | null | undefined): {
  semesterNum: number | null;
  sectionCode: string | null;
} {
  if (!semester?.trim()) return { semesterNum: null, sectionCode: null };
  const parts = semester.trim().split('-');
  const roman = parts[0]?.trim().toUpperCase() ?? '';
  const sectionCode = parts[1]?.trim().toUpperCase() || null;
  return {
    semesterNum: ROMAN_SEMESTER[roman] ?? null,
    sectionCode,
  };
}

export function normalizeProgram(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

export function allocationMatchesStudentSlot(
  allocationSemester: string | null,
  allocationProgram: string | null,
  studentSemester: number,
  studentSection: string | null,
  studentProgram: string,
): boolean {
  const { semesterNum, sectionCode } = parseAllocationSemester(allocationSemester);
  if (semesterNum != null && semesterNum !== studentSemester) return false;

  const allocProgram = normalizeProgram(allocationProgram);
  const prog = normalizeProgram(studentProgram);
  if (prog && allocProgram && prog !== allocProgram) return false;

  const studentSectionNorm = studentSection?.trim().toUpperCase() ?? null;
  if (sectionCode && studentSectionNorm && sectionCode !== studentSectionNorm) {
    return false;
  }

  return true;
}
