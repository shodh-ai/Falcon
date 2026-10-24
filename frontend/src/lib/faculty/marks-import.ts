export type ImportRosterStudent = {
  student_user_id: string;
  roll_number: string;
  name: string;
};

export type ImportedMark = {
  student_user_id: string;
  marks_obtained: number;
};

/** Fail closed: one exact roster UUID, matching roll/name, and one valid mark per student. */
export function validateMarksImport(
  records: Record<string, unknown>[],
  roster: ImportRosterStudent[],
  maxMarks: number,
): ImportedMark[] {
  if (!roster.length) throw new Error('The selected course has no enrolled students');
  if (!records.length) throw new Error('The mark sheet is empty');
  if (records.length !== roster.length) {
    throw new Error(`The sheet has ${records.length} rows but the course roster has ${roster.length} students`);
  }
  const byId = new Map(roster.map((student) => [student.student_user_id.toLowerCase(), student]));
  if (byId.size !== roster.length) throw new Error('Duplicate students in the course roster');
  const seen = new Set<string>();
  const marks = records.map((record, index) => {
    const row = index + 2;
    const id = String(record.student_user_id ?? '').trim().toLowerCase();
    const roll = String(record.roll_number ?? '').trim();
    const name = String(record.student_name ?? '').trim();
    const student = byId.get(id);
    if (!student) throw new Error(`Row ${row}: student_user_id is not in this course roster`);
    if (seen.has(id)) throw new Error(`Row ${row}: duplicate student`);
    if (!roll || roll !== student.roll_number.trim()) {
      throw new Error(`Row ${row}: roll number does not match ${student.name}`);
    }
    if (!name || name.localeCompare(student.name.trim(), undefined, { sensitivity: 'base' }) !== 0) {
      throw new Error(`Row ${row}: student name does not match the roster`);
    }
    const raw = record.marks_obtained;
    if (raw === '' || raw === undefined || raw === null) {
      throw new Error(`Row ${row}: marks are missing`);
    }
    const score = Number(raw);
    if (!Number.isFinite(score) || score < 0 || score > maxMarks ||
        Math.abs(Math.round(score * 100) - score * 100) > 1e-7) {
      throw new Error(`Row ${row}: marks must be from 0 to ${maxMarks}, with at most two decimal places`);
    }
    seen.add(id);
    return { student_user_id: student.student_user_id, marks_obtained: score };
  });
  if (seen.size !== byId.size) throw new Error('The mark sheet omits an enrolled student');
  return marks;
}
