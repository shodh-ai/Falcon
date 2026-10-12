type TimetableRow = {
  course_id: string;
  course?: { course_code: string; course_name: string } | null;
  section?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type PendingPracticalBatch = {
  course_id: string;
  course_code: string;
  course_name: string;
};

function normalizedSection(value?: string | null): string | null {
  return (
    value
      ?.trim()
      .toUpperCase()
      .replace(/[\s_]+/g, '-') || null
  );
}

function isDedicatedPracticalBatch(value?: string | null): boolean {
  return normalizedSection(value)?.startsWith('BATCH-') ?? false;
}

/**
 * A published rotation contains simultaneous labs for different batches.
 * Enrollment in the course alone does not establish a student's lab batch.
 */
export function selectStudentTimetableRows<T extends TimetableRow>(
  rows: T[],
  batchByCourse: Map<string, string>,
  enrollmentSectionByCourse: Map<string, string | null>,
): { rows: T[]; pendingPracticalBatches: PendingPracticalBatch[] } {
  const visible: T[] = [];
  const batchCourses = new Map<string, T>();
  const matchedBatchCourses = new Set<string>();

  for (const row of rows) {
    if (!isDedicatedPracticalBatch(row.section)) {
      visible.push(row);
      continue;
    }

    batchCourses.set(row.course_id, row);
    const explicitEnrollmentSection = enrollmentSectionByCourse.get(
      row.course_id,
    );
    const assignedSection =
      batchByCourse.get(row.course_id) ??
      (isDedicatedPracticalBatch(explicitEnrollmentSection)
        ? explicitEnrollmentSection
        : null);

    if (normalizedSection(assignedSection) === normalizedSection(row.section)) {
      visible.push(row);
      matchedBatchCourses.add(row.course_id);
    }
  }

  const pendingPracticalBatches = [...batchCourses]
    .filter(([courseId]) => !matchedBatchCourses.has(courseId))
    .map(([courseId, row]) => ({
      course_id: courseId,
      course_code: row.course?.course_code ?? courseId,
      course_name:
        row.course?.course_name ?? row.course?.course_code ?? courseId,
    }))
    .sort((a, b) => a.course_code.localeCompare(b.course_code));

  return {
    rows: visible.sort(
      (a, b) =>
        a.day_of_week - b.day_of_week ||
        String(a.start_time).localeCompare(String(b.start_time)),
    ),
    pendingPracticalBatches,
  };
}

function minutes(value: string): number {
  const [hours, minute] = String(value).slice(0, 5).split(':').map(Number);
  return hours * 60 + minute;
}

/** Remaining overlaps are data conflicts, not alternative batches. */
export function countStudentTimetableConflicts(rows: TimetableRow[]): number {
  let conflicts = 0;
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (rows[i].day_of_week !== rows[j].day_of_week) continue;
      if (
        minutes(rows[i].start_time) < minutes(rows[j].end_time) &&
        minutes(rows[j].start_time) < minutes(rows[i].end_time)
      ) {
        conflicts += 1;
      }
    }
  }
  return conflicts;
}
