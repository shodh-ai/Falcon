import { ForbiddenException } from '@nestjs/common';
import { UosGovernanceService } from './uos-governance.service';

describe('UOS grade-change teaching access', () => {
  it('rejects a request when the faculty does not teach the student subject', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce([]) };
    const service = new UosGovernanceService(db as any, {} as any, {} as any);

    await expect(
      service.createGradeChange('tenant-id', 'faculty-id', {
        student_user_id: 'student-id',
        course_code: 'BP501T',
        from_grade: 'C',
        to_grade: 'B',
        reason: 'Verified correction',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const sql = db.query.mock.calls[0][0] as string;
    expect(sql).toContain("a.status = 'ACTIVE'");
    expect(sql).toContain('t.deleted_at IS NULL');
    expect(sql).toContain("e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')");
  });

  it('allows a HOD to request a change for an enrolled student in the HOD department', async () => {
    const db = { query: jest.fn() };
    db.query
      // resolveHodDepartmentIds: departments.hod_user_id
      .mockResolvedValueOnce([{ dept_id: 12 }])
      // resolveHodDepartmentIds: users.dept_id
      .mockResolvedValueOnce([{ dept_id: 12 }])
      // course/enrollment access
      .mockResolvedValueOnce([
        { course_id: 'course-1', course_code: 'BP501T', course_name: 'Pharmacology' },
      ])
      // duplicate check
      .mockResolvedValueOnce([])
      // insert request
      .mockResolvedValueOnce([
        {
          change_id: 'change-1',
          course_code: 'BP501T',
          from_grade: 'C',
          to_grade: 'B',
        },
      ])
      // DOFA + student + notification target queries
      .mockResolvedValue([]);

    const dofa = { openCase: jest.fn().mockResolvedValue({ case_id: 'case-1' }) };
    const notify = { gradeChangeHodPending: jest.fn() };
    const service = new UosGovernanceService(db as any, dofa as any, notify as any);

    await expect(
      service.createGradeChange(
        'tenant-id',
        'hod-id',
        {
          student_user_id: 'student-id',
          course_code: 'BP501T',
          from_grade: 'C',
          to_grade: 'B',
          reason: 'Verified correction',
        },
        ['HOD'],
      ),
    ).resolves.toMatchObject({ change_id: 'change-1' });

    const courseSql = db.query.mock.calls[2][0] as string;
    expect(courseSql).toContain('ha.status = \'ACTIVE\'');
    expect(courseSql).toContain('hs.dept_id = ANY($6::int[])');
  });

  it('scopes the HOD queue to students in the HOD department', async () => {
    const db = { query: jest.fn() };
    db.query
      .mockResolvedValueOnce([{ dept_id: 12 }])
      .mockResolvedValueOnce([{ dept_id: 12 }])
      .mockResolvedValueOnce([]);
    const service = new UosGovernanceService(db as any, {} as any, {} as any);

    await expect(
      service.listGradeChanges('tenant-id', 'hod-id', ['HOD']),
    ).resolves.toEqual([]);

    const sql = db.query.mock.calls[2][0] as string;
    expect(sql).toContain('s.dept_id = ANY($3::int[])');
    expect(sql).not.toContain('hca.course_id');
  });

  it('scopes the HOD queue to the HOD department', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ dept_id: 17 }])
        .mockResolvedValueOnce([{ dept_id: 17 }])
        .mockResolvedValueOnce([]),
    };
    const service = new UosGovernanceService(db as any, {} as any, {} as any);

    await service.listGradeChanges('tenant-id', 'hod-id', ['HOD']);

    expect(db.query).toHaveBeenCalledTimes(3);
    const sql = db.query.mock.calls[2][0] as string;
    expect(sql).toContain('s.dept_id = ANY');
    expect(db.query.mock.calls[2][1]).toEqual(['tenant-id', null, [17]]);
  });
});
