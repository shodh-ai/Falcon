import { AcademicsService } from './academics.service';

describe('HOD faculty roster allocations', () => {
  it('exposes active allocations even when a faculty member has no timetable slot', async () => {
    const manager = {
      query: jest
        .fn()
        // employee profile lookup
        .mockResolvedValueOnce([])
        // published timetable lookup: intentionally empty for an unscheduled allocation
        .mockResolvedValueOnce([])
        // active allocation lookup
        .mockResolvedValueOnce([
          {
            allocation_id: 'allocation-1',
            faculty_user_id: 'faculty-yogesh',
            course_id: 'course-bp106t',
            course_code: 'BP106T',
            course_name: 'Pharmaceutical Chemistry I',
            program_name: 'B.Pharm',
            semester: 'I',
            academic_year: '2026-2027',
          },
        ]),
    };
    const users = {
      manager,
      findOne: jest.fn().mockResolvedValue({ user_id: 'hod-1', name: 'HOD' }),
    };
    const service = new AcademicsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      users as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    (service as any).resolveHodDepartmentIds = jest.fn().mockResolvedValue([7]);
    (service as any).listDepartmentFacultyRaw = jest.fn().mockResolvedValue([
      {
        user_id: 'faculty-yogesh',
        name: 'Yogesh Matta',
        email: 'yogesh.matta@example.edu',
        official_email: 'yogesh.matta@example.edu',
        phone: null,
        entity_id: null,
        reporting_officer_id: 'hod-1',
        created_at: null,
        department: { dept_name: 'Pharmacy' },
        role: { role_name: 'Faculty' },
      },
    ]);

    const [rosterMember] = await service.listHodFacultyRoster('tenant-1', 'hod-1');

    expect(rosterMember.courses).toEqual([]);
    expect(rosterMember.assigned_courses).toEqual([
      expect.objectContaining({
        allocation_id: 'allocation-1',
        course_code: 'BP106T',
        scheduled: false,
      }),
    ]);
    expect(manager.query).toHaveBeenCalledTimes(3);
  });
});
