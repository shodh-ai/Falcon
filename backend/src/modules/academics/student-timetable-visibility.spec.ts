import {
  countStudentTimetableConflicts,
  selectStudentTimetableRows,
} from './student-timetable-visibility';

type Row = {
  course_id: string;
  course: { course_code: string; course_name: string };
  section: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

function row(courseId: string, section: string | null, day = 1): Row {
  return {
    course_id: courseId,
    course: { course_code: courseId, course_name: courseId },
    section,
    day_of_week: day,
    start_time: section ? '13:30:00' : '09:00:00',
    end_time: section ? '16:30:00' : '10:00:00',
  };
}

describe('student timetable practical batch visibility', () => {
  const monday = [
    row('BP101T', null),
    row('BP107P', 'BATCH-A'),
    row('BP111P', 'BATCH-B'),
    row('BP109P', 'BATCH-C'),
  ];

  it.each([
    ['A', 'BP107P', 'BATCH-A'],
    ['B', 'BP111P', 'BATCH-B'],
    ['C', 'BP109P', 'BATCH-C'],
  ])(
    'shows student batch %s one Monday lab: %s',
    (_batch, courseId, section) => {
      const batchByCourse = new Map([[courseId, section]]);
      const result = selectStudentTimetableRows(
        monday,
        batchByCourse,
        new Map(),
      );
      expect(result.rows.map((slot) => slot.course_id)).toEqual([
        'BP101T',
        courseId,
      ]);
      expect(countStudentTimetableConflicts(result.rows)).toBe(0);
    },
  );

  it('does not mistake theory section A for practical Batch A', () => {
    const enrollmentSections = new Map(
      monday.map((slot) => [slot.course_id, 'A']),
    );
    const result = selectStudentTimetableRows(
      monday,
      new Map(),
      enrollmentSections,
    );
    expect(result.rows.map((slot) => slot.course_id)).toEqual(['BP101T']);
    expect(
      result.pendingPracticalBatches.map((course) => course.course_code),
    ).toEqual(['BP107P', 'BP109P', 'BP111P']);
  });

  it('uses an explicitly recorded enrollment batch when the roster is not yet migrated', () => {
    const result = selectStudentTimetableRows(
      monday,
      new Map(),
      new Map([['BP111P', 'BATCH_B']]),
    );
    expect(result.rows.map((slot) => slot.course_id)).toEqual([
      'BP101T',
      'BP111P',
    ]);
  });

  it('honors persistent membership over stale enrollment section', () => {
    const result = selectStudentTimetableRows(
      [row('BP107P', 'BATCH-A'), row('BP107P', 'BATCH-B')],
      new Map([['BP107P', 'BATCH-B']]),
      new Map([['BP107P', 'BATCH-A']]),
    );
    expect(result.rows.map((slot) => slot.section)).toEqual(['BATCH-B']);
    expect(result.pendingPracticalBatches).toEqual([]);
  });

  it('flags an assigned batch that has no published slot', () => {
    const result = selectStudentTimetableRows(
      [row('BP107P', 'BATCH-A')],
      new Map([['BP107P', 'BATCH-C']]),
      new Map(),
    );
    expect(result.rows).toEqual([]);
    expect(result.pendingPracticalBatches).toHaveLength(1);
  });

  it('keeps whole-cohort practical sessions without a dedicated batch', () => {
    const result = selectStudentTimetableRows(
      [row('MPH105P', 'A')],
      new Map(),
      new Map(),
    );
    expect(result.rows).toHaveLength(1);
  });

  it('detects genuine post-filter overlap for escalation', () => {
    const result = selectStudentTimetableRows(
      [row('BP101T', null), { ...row('BP102T', null), start_time: '09:30:00' }],
      new Map(),
      new Map(),
    );
    expect(countStudentTimetableConflicts(result.rows)).toBe(1);
  });

  it('applies the same rule to an entire B.Pharm cohort, not one login', () => {
    for (let student = 0; student < 100; student += 1) {
      const batch = ['A', 'B', 'C'][student % 3];
      const result = selectStudentTimetableRows(
        monday,
        new Map([
          ['BP107P', `BATCH-${batch}`],
          ['BP111P', `BATCH-${batch}`],
          ['BP109P', `BATCH-${batch}`],
        ]),
        new Map(),
      );
      expect(
        result.rows.filter((slot) => slot.section?.startsWith('BATCH-')),
      ).toHaveLength(1);
      expect(countStudentTimetableConflicts(result.rows)).toBe(0);
    }
  });
});
