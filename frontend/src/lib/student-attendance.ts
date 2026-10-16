export type StudentAttendanceSubject = {
  course_code: string;
  course_name: string;
  semester: number;
  attendance_percent: string;
  status: string;
  present_count: number;
  absent_count: number;
  total_classes: number;
};

export type StudentAttendanceData = {
  overall_percent: number;
  subject_wise: StudentAttendanceSubject[];
  current_semester?: number;
  progression: { semester: number; status: string; courses_count: number }[];
};

export function getAttendanceSemesters(data: StudentAttendanceData | null): number[] {
  return [...new Set([
    ...(data?.subject_wise ?? []).map((row) => Number(row.semester)),
    Number(data?.current_semester),
  ].filter((semester) => Number.isInteger(semester) && semester > 0))].sort((a, b) => a - b);
}

export function getCurrentAttendanceSemester(data: StudentAttendanceData | null): number | null {
  const semesters = getAttendanceSemesters(data);
  const currentSemester = Number(data?.current_semester);
  return semesters.includes(currentSemester) ? currentSemester : semesters[semesters.length - 1] ?? null;
}

export function getSemesterAttendance(subjects: StudentAttendanceSubject[], semester: number | null) {
  const totals = subjects.reduce((sum, row) => {
    const marked = Number(row.total_classes);
    if (Number(row.semester) === semester && marked > 0) {
      sum.attended += Number(row.present_count ?? 0);
      sum.marked += marked;
    }
    return sum;
  }, { attended: 0, marked: 0 });
  const percent = totals.marked > 0 ? (totals.attended / totals.marked) * 100 : null;

  return {
    ...totals,
    percent,
    // Each additional attended class increases both the numerator and denominator.
    classesNeeded: percent == null ? null : Math.max(0, Math.ceil((75 * totals.marked - 100 * totals.attended) / 25)),
  };
}
