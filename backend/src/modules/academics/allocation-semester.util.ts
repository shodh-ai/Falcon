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
  const label = parts[0]?.trim().toUpperCase() ?? '';
  const sectionCode = parts[1]?.trim().toUpperCase() || null;
  const numeric = /^(?:SEM(?:ESTER)?\s*)?([1-8])$/.exec(label);
  return {
    semesterNum: ROMAN_SEMESTER[label] ?? (numeric ? Number(numeric[1]) : null),
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
  const alloc = normalizeProgram(allocationProgram).replace(/[^A-Z0-9]/g, '');
  const prog = normalizeProgram(studentProgram).replace(/[^A-Z0-9]/g, '');
  // An unknown programme is not evidence that a student belongs to every
  // allocation in the tenant.  The sync must fail closed until it is known.
  if (!prog || !alloc) return false;
  if (prog === alloc) return true;
  // Pharmacy programmes are deliberately exact.  A broad `PHARM` match
  // would put D.Pharm and M.Pharm students into B.Pharm offerings during
  // roster/enrollment reconciliation.
  const pharmacyProgram = (value: string): string | null => {
    if (value === 'BPHARM' || value.startsWith('BPHARMLATERAL')) {
      return 'BPHARM';
    }
    if (value === 'DPHARM' || value.startsWith('DPHARMREGULAR')) {
      return 'DPHARM';
    }
    if (value === 'MPHARMPHARMACEUTICS') {
      return 'MPHARMPHARMACEUTICS';
    }
    return null;
  };
  const allocPharmacy = pharmacyProgram(alloc);
  const progPharmacy = pharmacyProgram(prog);
  if (allocPharmacy || progPharmacy) {
    return allocPharmacy != null && allocPharmacy === progPharmacy;
  }
  // Legacy student batch labels below have a verified one-to-one 2026
  // allocation mapping. Do not replace this with a discipline substring test.
  // Substring matching admitted M.Tech CSE students to B.Tech CSE courses,
  // and even matched M.Tech to Mechanical Engineering via "ME".
  const aliases: Record<string, string> = {
    BTECHMECH: 'BTECHME',
    BTECHMECHANICAL: 'BTECHME',
    BTECHMECHANICALENGINEERING: 'BTECHME',
    BTECHLATERALENTRYMECHANICALENGINEERING: 'BTECHME',
    BTECHCOMPUTERSCIENCE: 'BTECHCSE',
    BTECHCOMPUTERSCIENCEENGINEERING: 'BTECHCSE',
    AGRI: 'BSCAGRICULTURE',
    AGRICULTURE: 'BSCAGRICULTURE',
    BSCAGRI: 'BSCAGRICULTURE',
    APPLIEDSCIENCES: 'BSCAPPLIEDSCIENCES',
    EDUCATION: 'BEDEDUCATION',
    LAW: 'LLBLAW',
    ISBM: 'BBAISBM',
    SILS: 'BASILS',
    C3WR: 'BTECHC3WR',
    CA: 'BCOMCA',
    GCAD: 'BDESGCAD',
  };
  return (aliases[alloc] ?? alloc) === (aliases[prog] ?? prog);
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
  if (semesterNum == null || semesterNum !== studentSemester) return false;

  if (!programsMatch(allocationProgram, studentProgram)) return false;

  const studentSectionNorm = studentSection?.trim().toUpperCase() ?? null;
  if (sectionCode && sectionCode !== studentSectionNorm) {
    return false;
  }

  return true;
}
