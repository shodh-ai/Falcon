import { AcademicsService } from './academics.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

const course = '1031060c-c1dc-4c2f-b1e0-b4910edcad8d';
const adjustment = '84000000-0000-4000-8000-000000000001';
const tenant = '74000000-0000-4000-8000-000000000001';
const student = '64000000-0000-4000-8000-000000000001';
const regular = {
  timetable_id: '54000000-0000-4000-8000-000000000001',
  course_id: course,
  course_code: 'TEST101',
  course_name: 'Enrolled subject',
  credits: 2,
  faculty_name: 'Original faculty',
  room: 'Room A',
  section: 'A',
  day_of_week: 2,
  start_time: '11:00',
  end_time: '12:00',
  is_virtual: false,
  live_join_url: null,
};
const extra = {
  adjustment_id: adjustment,
  course_id: course,
  course_code: 'TEST101',
  course_name: 'Enrolled subject',
  credits: 2,
  room: 'Room B',
  faculty_name: 'Allocated faculty',
  session_date: '2026-10-27',
  start_time: '14:30',
  end_time: '15:30',
  student_semester: 6,
  student_section: 'A',
  student_program: 'B.Tech CSE',
  allocation_semester: 'VI-A',
  allocation_program: 'B.Tech CSE',
  academic_year: '2026-2027',
};
const record = (fields: Record<string, unknown> = {}) => ({
  date: '2026-10-27',
  course_id: course,
  timetable_id: null,
  class_adjustment_id: adjustment,
  attendance_data: [{ student_id: student, status: 'PRESENT' }],
  ...fields,
});
const sundayMove = {
  source_timetable_id: regular.timetable_id,
  source_date: '2026-10-27',
  target_date: '2026-11-01',
  target_start_time: '11:00',
  target_end_time: '12:00',
  target_room: 'Room B',
};

function fixture(
  extras = [extra],
  logs: ReturnType<typeof record>[] = [],
  base = [regular],
  moves: (typeof sundayMove)[] = [],
) {
  const query = jest.fn((sql: string) => {
    if (sql.includes('FROM academic_class_moves'))
      return Promise.resolve(moves);
    if (sql.includes('FROM class_adjustments a'))
      return Promise.resolve(extras);
    if (sql.includes('FROM course_attendance_logs cal'))
      return Promise.resolve(logs);
    return Promise.resolve([]);
  });
  const service = Object.create(AcademicsService.prototype) as AcademicsService;
  Object.assign(service, {
    courseEnrollments: { manager: { query } },
    resolveStudentWeeklyTimetable: jest.fn().mockResolvedValue({
      tenantId: tenant,
      courseIds: [extras[0]?.course_id ?? course],
      slots: base,
      pendingPracticalBatches: [],
      conflictCount: 0,
    }),
  });
  return { service, query };
}

describe('Student dated timetable and extra-class attendance', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-10-28T11:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it('adds an approved extra at its precise time without changing the regular session or attendance', async () => {
    const { service } = fixture(
      [extra],
      [
        record(),
        record({
          class_adjustment_id: null,
          timetable_id: regular.timetable_id,
          attendance_data: [{ student_id: student, status: 'ABSENT' }],
        }),
      ],
    );
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(week.slots).toEqual([
      expect.objectContaining({
        timetable_id: regular.timetable_id,
        start_time: '11:00',
        attendance_status: 'ABSENT',
      }),
      expect.objectContaining({
        timetable_id: `extra:${adjustment}`,
        session_date: '2026-10-27',
        start_time: '14:30',
        end_time: '15:30',
        is_extra_class: true,
        attendance_status: 'PRESENT',
      }),
    ]);
  });

  it('does not use an extra-class record to invent attendance for an unmarked regular session', async () => {
    const { service } = fixture([extra], [record()]);
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(week.slots[0].attendance_status).toBe('PENDING');
    expect(week.slots[1].attendance_status).toBe('PRESENT');
  });

  it('ignores malformed attendance entries while retaining the signed-in student record', async () => {
    const { service } = fixture(
      [extra],
      [
        record({
          attendance_data: [
            null,
            'invalid',
            { student_id: student, status: 42 },
            { student_id: 'another-student', status: 'ABSENT' },
            { student_id: student, status: 'PRESENT' },
          ],
        }),
      ],
    );
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(week.slots[0].attendance_status).toBe('PENDING');
    expect(week.slots[1].attendance_status).toBe('PRESENT');
  });

  it('does not use one regular session record for a different regular session', async () => {
    const other = {
      ...regular,
      timetable_id: 'other',
      start_time: '13:00',
      end_time: '14:00',
    };
    const { service } = fixture(
      [],
      [
        record({
          class_adjustment_id: null,
          timetable_id: regular.timetable_id,
        }),
      ],
      [regular, other],
    );
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(
      week.slots.map(
        (slot: { attendance_status: string | null }) => slot.attendance_status,
      ),
    ).toEqual(['PRESENT', 'PENDING']);
  });

  it('never borrows a legacy course-only record for an extra class', async () => {
    const { service } = fixture(
      [extra],
      [record({ class_adjustment_id: null })],
    );
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(
      week.slots.map(
        (slot: { attendance_status: string | null }) => slot.attendance_status,
      ),
    ).toEqual(['PRESENT', 'PENDING']);
  });

  it("does not show another student's saved attendance as this student's attendance", async () => {
    const { service } = fixture(
      [extra],
      [
        record({
          attendance_data: [
            { student_id: 'another-student', status: 'PRESENT' },
          ],
        }),
      ],
    );
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(
      week.slots.map(
        (slot: { attendance_status: string | null }) => slot.attendance_status,
      ),
    ).toEqual(['PENDING', 'PENDING']);
  });

  it('keeps separate extra sessions of the same course/date distinct', async () => {
    const second = {
      ...extra,
      adjustment_id: '84000000-0000-4000-8000-000000000002',
      start_time: '16:00',
      end_time: '17:00',
    };
    const { service } = fixture([extra, second], [record()]);
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(
      week.slots
        .filter((slot) => slot.is_extra_class)
        .map((slot) => slot.attendance_status),
    ).toEqual(['PRESENT', 'PENDING']);
  });

  it.each([
    { student_section: 'B' },
    { student_program: 'M.Tech CSE' },
    { student_semester: 4 },
    { academic_year: '2025-2026' },
    { student_program: '' },
  ])(
    'excludes extras outside the active allocation scope: %j',
    async (change) => {
      const { service } = fixture([{ ...extra, ...change }]);
      const week = await service.getWeeklyTimetableCalendar(
        student,
        '2026-10-26',
      );
      expect(
        week.slots.some(
          (slot: { is_extra_class?: boolean }) => slot.is_extra_class,
        ),
      ).toBe(false);
    },
  );

  it('de-duplicates matching allocations while preserving environment-specific IDs', async () => {
    const changed = {
      ...extra,
      course_id: '93000000-0000-4000-8000-000000000099',
      adjustment_id: '94000000-0000-4000-8000-000000000099',
    };
    const { service, query } = fixture([changed, changed], [], []);
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(week.slots).toHaveLength(1);
    expect(week.slots[0].timetable_id).toBe(`extra:${changed.adjustment_id}`);
    const call = query.mock.calls.find(([sql]) =>
      sql.includes('FROM class_adjustments a'),
    )!;
    expect((call as unknown[])[1]).toEqual([
      tenant,
      student,
      [changed.course_id],
      '2026-10-26',
      '2026-11-01',
    ]);
  });

  it('enforces enrollment, tenant, approval, ownership and IST date restrictions in the query', async () => {
    const { service, query } = fixture();
    await service.getWeeklyTimetableCalendar(student, '2026-10-26');
    const sql = query.mock.calls.find(([sql]) =>
      sql.includes('FROM class_adjustments a'),
    )![0];
    for (const clause of [
      'e.student_user_id=$2::uuid',
      "e.status='ENROLLED'",
      'a.tenant_id=$1::uuid',
      'a.course_id=ANY($3::uuid[])',
      "a.status IN ('APPROVED','NOTIFIED')",
      "a.adjustment_type='EXTRA_CLASS'",
      'ca.faculty_user_id=a.faculty_user_id',
      "ca.status='ACTIVE'",
      "sp.status='ACTIVE'",
      "AT TIME ZONE 'Asia/Kolkata'",
      'BETWEEN $4::date AND $5::date',
    ])
      expect(sql).toContain(clause);
    expect(query.mock.calls.every(([sql]) => /^\s*SELECT\b/i.test(sql))).toBe(
      true,
    );
  });

  it('uses IST and the same dated calendar for today, including extras on a day without regular classes', async () => {
    jest.setSystemTime(new Date('2026-10-27T19:00:00Z')); // 28 October in India.
    const { service } = fixture([{ ...extra, session_date: '2026-10-28' }]);
    const today = await service.getTodayTimetable(student);
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({
      timetable_id: `extra:${adjustment}`,
      session_date: '2026-10-28',
      is_extra_class: true,
    });
  });

  it('includes an approved Sunday extra without adding it to other dates', async () => {
    const { service } = fixture([{ ...extra, session_date: '2026-11-01' }]);
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(week.week_dates.at(-1)).toEqual({
      day_of_week: 7,
      label: 'Sun',
      date: '2026-11-01',
    });
    expect(week.slots.at(-1)).toMatchObject({
      day_of_week: 7,
      session_date: '2026-11-01',
    });
  });

  it('shows an approved Sunday reschedule without requiring a Sunday extra', async () => {
    const { service } = fixture([], [], [regular], [sundayMove]);
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(week.week_dates.at(-1)).toEqual({
      day_of_week: 7,
      label: 'Sun',
      date: '2026-11-01',
    });
    expect(week.slots).toHaveLength(1);
    expect(week.slots[0]).toMatchObject({
      timetable_id: regular.timetable_id,
      day_of_week: 7,
      session_date: '2026-11-01',
      start_time: '11:00',
      room: 'Room B',
    });
  });

  it('dates a regular Sunday class and matches its exact saved attendance', async () => {
    jest.setSystemTime(new Date('2026-11-02T11:00:00Z'));
    const { service } = fixture(
      [],
      [
        record({
          date: '2026-11-01',
          timetable_id: regular.timetable_id,
          class_adjustment_id: null,
        }),
      ],
      [{ ...regular, day_of_week: 7 }],
    );
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(week.week_dates.at(-1)?.date).toBe('2026-11-01');
    expect(week.slots[0]).toMatchObject({
      session_date: '2026-11-01',
      attendance_status: 'PRESENT',
    });
  });

  it('returns one Sunday header for a moved class and an approved extra', async () => {
    const { service } = fixture(
      [{ ...extra, session_date: '2026-11-01' }],
      [],
      [regular],
      [sundayMove],
    );
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(week.week_dates.filter((day) => day.day_of_week === 7)).toHaveLength(
      1,
    );
    expect(week.slots).toHaveLength(2);
    expect(week.slots.every((slot) => slot.session_date === '2026-11-01')).toBe(
      true,
    );
  });

  it('keeps six visible days when there are no Sunday classes', async () => {
    const { service } = fixture();
    const week = await service.getWeeklyTimetableCalendar(
      student,
      '2026-10-26',
    );
    expect(week.week_dates.map((day) => day.day_of_week)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('includes a regular Sunday class in today and the weekly calendar', async () => {
    jest.setSystemTime(new Date('2026-11-01T04:00:00Z'));
    const { service } = fixture([], [], [{ ...regular, day_of_week: 7 }]);
    const today = await service.getTodayTimetable(student);
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({
      timetable_id: regular.timetable_id,
      session_date: '2026-11-01',
      status: 'upcoming',
    });
  });
});
