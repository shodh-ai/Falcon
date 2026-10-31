import { AttendanceDeadlineReminderService } from './attendance-deadline-reminder.service';

describe('Attendance deadline reminders', () => {
  const now = new Date('2026-10-30T18:15:00.000Z');
  const candidate = {
    tenant_id: 'tenant-1',
    faculty_user_id: 'faculty-1',
    log_faculty_id: 'faculty-1',
    course_id: 'course-1',
    course_code: 'DA101',
    timetable_id: 'slot-1',
    class_adjustment_id: null,
    class_date: '2026-10-27',
    section: 'A',
    deadline_at: new Date(now.getTime() + 14 * 60_000).toISOString(),
  };

  it('creates an idempotent 15-minute reminder for an incomplete eligible session', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([{ notification_id: 'notice-1' }])
      .mockResolvedValueOnce([]);
    const service = new AttendanceDeadlineReminderService({ query } as never);
    await expect(service.scanAttendanceDeadlines(now)).resolves.toEqual({
      candidates: 1,
      sent: 1,
    });
    const calls = query.mock.calls as unknown as Array<
      [string, unknown[] | undefined]
    >;
    expect(calls[1][0]).toContain('ON CONFLICT DO NOTHING');
    expect(calls[1][1]).toEqual(expect.arrayContaining(['REMINDER_15']));
  });

  it('does not create reminders when the eligibility query excludes submitted attendance', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const service = new AttendanceDeadlineReminderService({ query } as never);
    await expect(service.scanAttendanceDeadlines(now)).resolves.toEqual({
      candidates: 0,
      sent: 0,
    });
    const calls = query.mock.calls as unknown as Array<
      [string, unknown[] | undefined]
    >;
    const eligibilitySql = calls[0][0];
    expect(eligibilitySql).toContain(
      'NOT EXISTS (SELECT 1 FROM course_attendance_logs',
    );
    expect(eligibilitySql).toContain('generate_series($1::int,$1::int+1)');
    expect(eligibilitySql).toContain("a.adjustment_type='CANCEL'");
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('creates the five-minute reminder without duplicating the earlier reminder', async () => {
    const fiveMinuteCandidate = {
      ...candidate,
      deadline_at: new Date(now.getTime() + 4 * 60_000).toISOString(),
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([fiveMinuteCandidate])
      .mockResolvedValueOnce([{ notification_id: 'notice-5' }])
      .mockResolvedValueOnce([]);
    const service = new AttendanceDeadlineReminderService({ query } as never);
    await expect(service.scanAttendanceDeadlines(now)).resolves.toEqual({
      candidates: 1,
      sent: 1,
    });
    const calls = query.mock.calls as unknown as Array<
      [string, unknown[] | undefined]
    >;
    expect(calls[1][1]).toEqual(expect.arrayContaining(['REMINDER_5']));
    expect(calls[1][0]).toContain('ON CONFLICT DO NOTHING');
  });

  it('records and notifies automatic relock after an approved window expires', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ notification_id: 'expired-1' }]);
    const service = new AttendanceDeadlineReminderService({ query } as never);
    await expect(service.scanAttendanceDeadlines(now)).resolves.toEqual({
      candidates: 0,
      sent: 1,
    });
    const calls = query.mock.calls as unknown as Array<
      [string, unknown[] | undefined]
    >;
    expect(calls[1][0]).toContain("e.event_type='RELOCKED'");
    expect(calls[1][0]).toContain('Attendance window expired');
  });

  it('creates the locked-missing notification immediately after the deadline', async () => {
    const lockedCandidate = {
      ...candidate,
      deadline_at: new Date(now.getTime() - 30_000).toISOString(),
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([lockedCandidate])
      .mockResolvedValueOnce([{ notification_id: 'locked-1' }])
      .mockResolvedValueOnce([]);
    const service = new AttendanceDeadlineReminderService({ query } as never);

    await expect(service.scanAttendanceDeadlines(now)).resolves.toEqual({
      candidates: 1,
      sent: 1,
    });
    const calls = query.mock.calls as unknown as Array<
      [string, unknown[] | undefined]
    >;
    expect(calls[1][1]).toEqual(expect.arrayContaining(['LOCKED_MISSING']));
  });
});
