import { AcademicsService } from './academics.service';

describe('HOD workload declaration reliability', () => {
  function makeService(manager: { transaction: jest.Mock; query: jest.Mock }) {
    const users = { manager };
    return new AcademicsService(
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
  }

  it('commits a no-teaching-load declaration and history row atomically', async () => {
    const transactionManager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([]) // idempotency lookup
        .mockResolvedValueOnce([{ user_id: 'faculty-1', dept_id: 10 }]) // faculty scope
        .mockResolvedValueOnce([]) // current declaration
        .mockResolvedValueOnce([]) // active allocations
        .mockResolvedValueOnce([
          {
            declaration_id: 'declaration-1',
            status: 'NO_TEACHING_LOAD',
            revision: 1,
          },
        ]) // declaration upsert
        .mockResolvedValueOnce([]), // history insert
    };
    const manager = {
      query: jest.fn().mockResolvedValue([{ dept_id: 10 }]),
      transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(transactionManager),
      ),
    };
    const service = makeService(manager);
    (service as any).resolveHodDepartmentIds = jest.fn().mockResolvedValue([10]);

    await expect(
      service.setHodFacultyLoadDeclaration(
        'tenant-1',
        'hod-1',
        'HOD',
        'faculty-1',
        {
          academicYear: '2026-2027',
          status: 'NO_TEACHING_LOAD',
          reason: 'No assigned teaching load this academic year',
          expectedRevision: 0,
          idempotencyKey: 'load-test-1',
        },
      ),
    ).resolves.toMatchObject({ declaration_id: 'declaration-1' });

    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(transactionManager.query).toHaveBeenCalledWith(
      expect.stringContaining('academic_faculty_load_declaration_history'),
      expect.arrayContaining(['load-test-1']),
    );
  });

  it('uses stable PostgreSQL parameter types when preserving assigned courses as unassigned needs', async () => {
    const transactionManager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT h.request_hash')) return [];
        if (sql.includes('SELECT u.user_id, u.dept_id')) {
          return [{ user_id: 'faculty-1', dept_id: 10 }];
        }
        if (sql.includes('SELECT * FROM academic_faculty_load_declarations')) return [];
        if (sql.includes('SELECT allocation_id')) {
          return [{
            allocation_id: 'allocation-1', tenant_id: 'tenant-1', subject_id: 42,
            program_name: 'B.Pharm', semester: 'V', academic_year: '2026-2027',
            course_id: 'course-1',
          }];
        }
        if (sql.includes('INSERT INTO academic_faculty_load_declarations')) {
          return [{ declaration_id: 'declaration-1', status: 'NO_TEACHING_LOAD', revision: 1 }];
        }
        return [];
      }),
    };
    const manager = {
      query: jest.fn(),
      transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(transactionManager)),
    };
    const service = makeService(manager);
    (service as any).resolveHodDepartmentIds = jest.fn().mockResolvedValue([10]);

    await expect(service.setHodFacultyLoadDeclaration('tenant-1', 'hod-1', 'HOD', 'faculty-1', {
      academicYear: '2026-2027', status: 'NO_TEACHING_LOAD', reason: 'Administrative duties',
      expectedRevision: 0, idempotencyKey: 'load-with-allocations',
    })).resolves.toMatchObject({ status: 'NO_TEACHING_LOAD', revision: 1 });

    const insert = transactionManager.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO academic_course_allocations'));
    expect(insert?.[0]).toContain('$3::varchar(100)');
    expect(insert?.[0]).toContain('$4::varchar(20)');
    expect(insert?.[0]).toContain('$5::varchar(20)');
    expect(transactionManager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE academic_timetables SET deleted_at = NOW()'),
      ['tenant-1', 'faculty-1', ['course-1']],
    );
  });
});
