export type AttendanceFormStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';
export type AttendanceApiStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

type AttendanceStudent = { student_id: string };
type SavedAttendanceEntry = { student_id: string; status: string };

/** Saved entries outside the current scheduled roster never enter the form. */
export function initializeAttendanceForm(
  roster: AttendanceStudent[],
  saved: SavedAttendanceEntry[] | null | undefined,
): Record<string, AttendanceFormStatus> {
  const result: Record<string, AttendanceFormStatus> = {};
  for (const student of roster) result[student.student_id] = 'ABSENT';
  for (const entry of saved ?? []) {
    if (!(entry.student_id in result)) continue;
    if (entry.status === 'EXCUSED') result[entry.student_id] = 'LEAVE';
    else if (['PRESENT', 'ABSENT', 'LATE'].includes(entry.status)) {
      result[entry.student_id] = entry.status as AttendanceFormStatus;
    }
  }
  return result;
}

/** Search only changes display. Always save every member of the exact roster. */
export function completeAttendancePayload(
  roster: AttendanceStudent[],
  attendance: Record<string, AttendanceFormStatus>,
): Array<{ student_id: string; status: AttendanceApiStatus }> {
  return roster.map(({ student_id }) => ({
    student_id,
    status: attendance[student_id] === 'LEAVE'
      ? 'EXCUSED'
      : attendance[student_id] ?? 'ABSENT',
  }));
}
