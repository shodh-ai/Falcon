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

/** Match allocation program labels to varied official student batch names. */
export function programsMatch(
  allocationProgram: string | null | undefined,
  studentProgram: string | null | undefined,
): boolean {
  const alloc = normalizeProgram(allocationProgram);
  const prog = normalizeProgram(studentProgram);
  if (!prog || !alloc) return true;
  if (prog === alloc) return true;
  if (
    alloc.includes('ME') &&
    (prog.includes('MECHANICAL') || prog.includes('MECH'))
  ) {
    return true;
  }
  if (alloc.includes('AGRI') && prog.includes('AGRI')) return true;
  if (alloc.includes('PHARM') && prog.includes('PHARM')) return true;
  if (
    alloc.includes('CSE') &&
    (prog.includes('COMPUTER') || prog.includes('CSE'))
  ) {
    return true;
  }
  return false;
}

export function allocationMatchesStudentSlot(
  allocationSemester: string | null,
  allocationProgram: string | null,
  studentSemester: number,
  studentSection: string | null,
  studentProgram: string,
): boolean {
  const { semesterNum, sectionCode } =
    parseAllocationSemester(allocationSemester);
  if (semesterNum != null && semesterNum !== studentSemester) return false;

  if (!programsMatch(allocationProgram, studentProgram)) return false;

  const studentSectionNorm = studentSection?.trim().toUpperCase() ?? null;
  if (sectionCode && studentSectionNorm && sectionCode !== studentSectionNorm) {
    return false;
  }

  return true;
}
