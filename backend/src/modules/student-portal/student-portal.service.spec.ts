import { StudentPortalService } from './student-portal.service';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

describe('StudentPortalService.getAttendance', () => {
  it('binds exactly the parameters referenced by the attendance query', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            course_code: 'CSE101',
            course_name: 'Programming',
            semester: 1,
            attendance_percent: '80',
            status: 'ENROLLED',
            present_count: 8,
            absent_count: 2,
            total_classes: 10,
          },
        ])
        .mockResolvedValueOnce([
          {
            current_semester: 1,
            enrolled_semester: 1,
            max_enrollment_semester: 1,
          },
        ]),
    };

    const unused = {} as never;
    const service = new StudentPortalService(
      dataSource as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );

    const result = await service.getAttendance('tenant-1', 'student-1');

    const [attendanceSql, attendanceParams] = dataSource.query.mock
      .calls[0] as [string, unknown[]];
    expect(attendanceSql).not.toContain('$3');
    expect(attendanceSql).toContain('COALESCE(stats.total_classes, 0) > 0');
    expect(attendanceParams).toEqual(['student-1', 'tenant-1']);
    expect(result.overall_percent).toBe(80);
    expect(result.current_semester).toBe(1);
  });

  it('uses marked class counts for a weighted overall percentage', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            course_code: 'CSE101',
            course_name: 'Programming',
            semester: 1,
            // This stale value must not override the marked-class counts.
            attendance_percent: '92',
            status: 'ENROLLED',
            present_count: 1,
            absent_count: 0,
            total_classes: 1,
          },
          {
            course_code: 'CSE102',
            course_name: 'Data Structures',
            semester: 1,
            attendance_percent: '50',
            status: 'ENROLLED',
            present_count: 1,
            absent_count: 1,
            total_classes: 2,
          },
        ])
        .mockResolvedValueOnce([
          {
            current_semester: 1,
            enrolled_semester: 1,
            max_enrollment_semester: 1,
          },
        ]),
    };

    const unused = {} as never;
    const service = new StudentPortalService(
      dataSource as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );

    const result = await service.getAttendance('tenant-1', 'student-1');

    // (1 present + 1 present) / (1 marked + 2 marked) × 100.
    expect(result.overall_percent).toBe(66.67);
  });
});

describe('StudentPortalService.getExamDesk', () => {
  type QueryMock = jest.Mock<
    Promise<Array<Record<string, unknown>>>,
    [string, unknown[]]
  >;

  function emptyQuery(): QueryMock {
    return jest
      .fn<Promise<Array<Record<string, unknown>>>, [string, unknown[]]>()
      .mockResolvedValue([]);
  }

  function serviceFor(query: QueryMock) {
    const unused = {} as never;
    return new StudentPortalService(
      { query } as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );
  }

  it('returns enrolled upcoming examinations using the schedule API criteria', async () => {
    const scheduled = {
      exam_schedule_id: 'schedule-1',
      subject_id: 364,
      subject: 'Operations verification',
      subject_code: 'SYNTH-OPS-261021',
      exam_date: '2026-11-15',
      start_time: '09:00:00',
      hall: 'Synthetic room',
      room: 'Synthetic room',
    };
    const query = emptyQuery();
    query.mockResolvedValueOnce([scheduled]);

    const result = await serviceFor(query).getExamDesk('tenant-1', 'student-1');

    expect(result.upcoming_exams).toEqual([scheduled]);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('s.tenant_id = $1');
    expect(sql).toContain('c.tenant_id = e.tenant_id');
    expect(sql).toContain('e.tenant_id = s.tenant_id');
    expect(sql).toContain('e.student_user_id = $2');
    expect(sql).toContain('enrolled_subject.subject_code = c.course_code');
    expect(sql).toContain('enrolled_subject.subject_id = s.subject_id');
    expect(sql).toContain('s.exam_date >= $3::date');
    expect(sql).toContain('ORDER BY s.exam_date ASC, s.start_time ASC');
    expect(params).toEqual([
      'tenant-1',
      'student-1',
      new Date().toISOString().slice(0, 10),
    ]);
  });

  it('preserves date-only values for upcoming examinations and published seats', async () => {
    const query = emptyQuery();
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { exam_name: 'Exam', exam_date: '2026-11-15', room: 'A' },
      ]);

    const result = await serviceFor(query).getExamDesk('tenant-1', 'student-1');

    expect(query.mock.calls[0][0]).toContain('s.exam_date::text AS exam_date');
    expect(query.mock.calls[3][0]).toContain('es.exam_date::text AS exam_date');
    expect((result.seating as Array<{ exam_date: string }>)[0].exam_date).toBe(
      '2026-11-15',
    );
  });

  it('returns a genuine empty upcoming schedule without demo entries', async () => {
    const result = await serviceFor(emptyQuery()).getExamDesk(
      'tenant-1',
      'student-1',
    );
    expect(result.upcoming_exams).toEqual([]);
  });

  it('propagates a failed schedule query instead of reporting zero examinations', async () => {
    const query = emptyQuery().mockRejectedValue(
      new Error('schedule unavailable'),
    );
    await expect(
      serviceFor(query).getExamDesk('tenant-1', 'student-1'),
    ).rejects.toThrow('schedule unavailable');
  });
});
