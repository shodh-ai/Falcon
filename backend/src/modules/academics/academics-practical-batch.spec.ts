jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-id') }));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { AcademicsFacultyService } from './academics-faculty.service';

const STUDENT_ID = '11111111-1111-4111-8111-111111111111';

function setup(
  managerRows: (sql: string) => unknown[],
  readRows?: (sql: string) => unknown[],
) {
  const manager = {
    query: jest.fn((sql: string) => Promise.resolve(managerRows(sql))),
  };
  const dataSource = {
    query: jest.fn((sql: string) =>
      Promise.resolve(
        readRows
          ? readRows(sql)
          : sql.includes('SELECT t.section')
            ? [{ section: 'BATCH-A', is_practical: true }]
            : [],
      ),
    ),
    transaction: jest.fn((work: (value: typeof manager) => Promise<unknown>) =>
      work(manager),
    ),
  };
  const service = new AcademicsFacultyService(
    dataSource as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  (
    service as unknown as { assertFacultyTeachesCourse: jest.Mock }
  ).assertFacultyTeachesCourse = jest.fn().mockResolvedValue(undefined);
  return { service, manager, dataSource };
}

describe('persistent practical batches', () => {
  it('creates a roster once from enrolled students, with course-level serialization', async () => {
    const { service, manager } = setup((sql) => {
      if (sql.includes('SELECT batch_id, revision')) return [];
      if (sql.includes('FROM student_course_enrollments'))
        return [{ student_user_id: STUDENT_ID }];
      if (
        sql.includes('SELECT m.student_user_id') &&
        sql.includes('academic_practical_batch_members')
      )
        return [];
      if (sql.includes('INSERT INTO academic_practical_batches'))
        return [{ batch_id: 'batch-1', revision: 1 }];
      return [];
    });
    const result = await service.savePracticalBatch(
      'course-1',
      'slot-1',
      'faculty-1',
      'tenant-1',
      0,
      [STUDENT_ID],
    );
    expect(result).toEqual({
      section_code: 'BATCH-A',
      revision: 1,
      student_count: 1,
    });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      ['practical:tenant-1:course-1'],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO academic_practical_batch_members'),
      ['batch-1', 'tenant-1', 'course-1', [STUDENT_ID], 'faculty-1'],
    );
  });

  it('rejects stale edits instead of silently replacing another faculty edit', async () => {
    const { service } = setup((sql) =>
      sql.includes('SELECT batch_id, revision')
        ? [{ batch_id: 'batch-1', revision: 2 }]
        : [],
    );
    await expect(
      service.savePracticalBatch(
        'course-1',
        'slot-1',
        'faculty-1',
        'tenant-1',
        1,
        [],
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects students outside the course and duplicate IDs', async () => {
    const { service } = setup(() => []);
    await expect(
      service.savePracticalBatch(
        'course-1',
        'slot-1',
        'faculty-1',
        'tenant-1',
        0,
        [STUDENT_ID],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.savePracticalBatch(
        'course-1',
        'slot-1',
        'faculty-1',
        'tenant-1',
        0,
        [STUDENT_ID, STUDENT_ID],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.savePracticalBatch(
        'course-1',
        'slot-1',
        'faculty-1',
        'tenant-1',
        0,
        ['not-a-uuid'],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a student actively assigned to another batch', async () => {
    const { service } = setup((sql) => {
      if (sql.includes('FROM student_course_enrollments'))
        return [{ student_user_id: STUDENT_ID }];
      if (
        sql.includes('SELECT m.student_user_id') &&
        sql.includes('academic_practical_batch_members')
      )
        return [{ student_user_id: STUDENT_ID }];
      return [];
    });
    await expect(
      service.savePracticalBatch(
        'course-1',
        'slot-1',
        'faculty-1',
        'tenant-1',
        0,
        [STUDENT_ID],
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a batch assignment that overlaps another confirmed course', async () => {
    const { service, manager } = setup((sql) => {
      if (sql.includes('FROM student_course_enrollments'))
        return [{ student_user_id: STUDENT_ID }];
      if (sql.includes('SELECT DISTINCT e.student_user_id'))
        return [{ student_user_id: STUDENT_ID }];
      return [];
    });
    await expect(
      service.savePracticalBatch(
        'course-1', 'slot-1', 'faculty-1', 'tenant-1', 0, [STUDENT_ID],
      ),
    ).rejects.toThrow('Batch overlaps another confirmed class');
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT DISTINCT e.student_user_id'),
      ['tenant-1', 'course-1', [STUDENT_ID], 'BATCH-A'],
    );
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO academic_practical_batches'),
      expect.anything(),
    );
  });

  it('keeps an already saved session roster when the current batch changes', async () => {
    const otherId = '22222222-2222-4222-8222-222222222222';
    const { service } = setup(
      () => [],
      (sql) => {
        if (sql.includes('SELECT t.section'))
          return [{ section: 'BATCH-A', is_practical: true }];
        if (sql.includes('SELECT batch_id FROM academic_practical_batches'))
          return [{ batch_id: 'batch-1' }];
        if (
          sql.includes('FROM academic_practical_batch_members') &&
          sql.includes('batch_id = $1')
        )
          return [{ student_user_id: otherId }];
        if (sql.includes('SELECT attendance_data FROM course_attendance_logs'))
          return [{ attendance_data: [{ student_id: STUDENT_ID }] }];
        if (sql.includes('SELECT u.user_id'))
          return [
            { user_id: STUDENT_ID, roll_number: 'R1' },
            { user_id: otherId, roll_number: 'R2' },
          ];
        return [];
      },
    );
    (
      service as unknown as { enrollmentRepo: { find: jest.Mock } }
    ).enrollmentRepo = {
      find: jest.fn().mockResolvedValue([
        {
          student_user_id: STUDENT_ID,
          section_code: null,
          student: { name: 'Original' },
        },
        {
          student_user_id: otherId,
          section_code: null,
          student: { name: 'New member' },
        },
      ]),
    };
    const rows = await service.getCourseStudents(
      'course-1',
      'faculty-1',
      'tenant-1',
      'slot-1',
      '2026-10-10',
    );
    expect(rows.map((row) => row.student_id)).toEqual([STUDENT_ID]);
  });
});
