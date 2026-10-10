import { CourseAllocationBulkService } from './course-allocation-bulk.service';

describe('CourseAllocationBulkService allocation/scheduling boundary', () => {
  it.each([
    ['a new course allocation', true],
    ['a co-faculty allocation on an existing course', false],
  ])('does not invent or reassign timetable slots for %s', async (_label, isNew) => {
    const row = {
      faculty_username: 'riya.pharmacy',
      subject_fullname: 'General Pharmacy',
      subject_code: 'BP102T',
      sub_type: 'TH',
      semester: 'I',
      program_name: 'B.Pharm',
      credits: 3,
    };
    const qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO academic_subjects')) {
          return [{ subject_id: 42 }];
        }
        if (sql.includes('INSERT INTO academic_courses')) {
          return [{ course_id: 'course-1' }];
        }
        // The pre-fix implementation would attempt to transfer these real
        // timetable slots to the newly allocated co-faculty member.
        if (sql.includes('UPDATE academic_timetables')) {
          return [{ timetable_id: 'other-faculty-slot' }];
        }
        return [];
      }),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
      createQueryRunner: jest.fn(() => qr),
    };
    const authService = {
      ensureTeachingFacultyRoleForHod: jest.fn().mockResolvedValue(undefined),
    };
    const enrollmentSync = {
      syncTenantStudents: jest.fn().mockResolvedValue(undefined),
    };
    const mentorSync = {
      syncTenantStudents: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CourseAllocationBulkService(
      dataSource as any,
      { timetableChanged: jest.fn() } as any,
      authService as any,
      enrollmentSync as any,
      mentorSync as any,
    );
    jest.spyOn(service, 'buildPreview').mockResolvedValue({
      rows: [{
        ...row,
        row_number: 2,
        is_new_subject: isNew as boolean,
        is_unassigned: false,
        faculty_user_id: 'riya-user',
        faculty_name: 'Riya',
        faculty_email: 'riya.pharmacy@mygyanvihar.com',
        faculty_photo_url: null,
        existing_subject_id: isNew ? null : 42,
        warnings: [],
      }],
      summary: {},
    });
    jest.spyOn(service as any, 'resolveDefaultProgramId').mockResolvedValue(7);

    const result = await service.executeBulkMap('tenant-1', '2026-2027', [row]);

    expect(result).toMatchObject({
      allocations_created: 1,
      courses_provisioned: 1,
      workspaces_assigned: 1,
    });
    expect(qr.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO academic_course_allocations'),
      ['tenant-1', 42, 'B.Pharm', 'I', 'riya-user', '2026-2027', 'course-1'],
    );
    const allQueries = [...qr.query.mock.calls, ...dataSource.query.mock.calls];
    expect(allQueries.some(([sql]) => String(sql).includes('academic_timetables'))).toBe(false);
    expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
    expect(qr.rollbackTransaction).not.toHaveBeenCalled();
    expect(enrollmentSync.syncTenantStudents).toHaveBeenCalledWith('tenant-1', '2026-2027');
  });

  it('keeps primary-only and secondary Faculty role checks tenant-scoped and excludes deleted targets', async () => {
    const calls: Array<[string, unknown[] | undefined]> = [];
    const dataSource = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        calls.push([sql, params]);
        if (sql.includes('FROM departments WHERE hod_user_id')) return [];
        if (sql.includes('SELECT dept_id FROM users')) return [{ dept_id: 10 }];
        if (sql.includes('SELECT u.user_id, u.name, u.dept_id')) {
          return [{ user_id: 'riya-user', name: 'Riya', dept_id: 10 }];
        }
        if (sql.includes('SELECT a.allocation_id, a.course_id')) {
          return [{
            allocation_id: 'allocation-1',
            course_id: 'course-1',
            subject_name: 'General Pharmacy',
            subject_code: 'BP102T',
            academic_year: '2026-2027',
          }];
        }
        return [];
      }),
    };
    const service = new CourseAllocationBulkService(
      dataSource as any,
      { timetableChanged: jest.fn() } as any,
      { ensureTeachingFacultyRoleForHod: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service as any, 'ensureFacultyTimetableSlotDirect').mockResolvedValue(undefined);

    await service.assignFacultyToAllocation(
      'tenant-1',
      'hod-1',
      'allocation-1',
      'riya-user',
    );

    const facultySql = calls.find(([sql]) => sql.includes('SELECT u.user_id, u.name, u.dept_id'))?.[0] ?? '';
    expect(facultySql).toContain('primary_role.role_id = u.role_id');
    expect(facultySql).toContain('FROM user_roles ur');
    expect(facultySql).toContain('u.deleted_at IS NULL');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('SET faculty_user_id = $1'),
      ['riya-user', 'allocation-1', 'tenant-1'],
    );
  });
});
