import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const facultyId = '33333333-3333-4333-8333-333333333333';
const enrolledStudentId = '44444444-4444-4444-8444-444444444444';
const outsideStudentId = '55555555-5555-4555-8555-555555555555';

const openSession = {
  entry_status: 'OPEN',
  marks_locked: false,
  declared_at: null,
  entry_open_at: null,
  entry_close_at: null,
};

function draft(studentIds = [enrolledStudentId]) {
  return {
    course_id: courseId,
    exam_type: 'CAT1',
    max_marks: 50,
    entries: studentIds.map((student_user_id, index) => ({
      student_user_id,
      marks_obtained: 30 + index,
    })),
  };
}

function createService(options?: {
  enrolledRows?: Array<{ student_user_id: string }>;
  session?: typeof openSession | null;
  locked?: boolean;
}) {
  const manager = { query: jest.fn() };
  const dataSource = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('exam_result_sessions')) {
        return options?.session === null ? [] : [options?.session ?? openSession];
      }
      if (sql.includes('FROM academic_marks')) {
        return options?.locked ? [{ mark_id: 'locked' }] : [];
      }
      return [];
    }),
    transaction: jest.fn(async (work: (transactionManager: typeof manager) => Promise<unknown>) =>
      work(manager),
    ),
  };
  manager.query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM student_course_enrollments')) {
      return options?.enrolledRows ?? [{ student_user_id: enrolledStudentId }];
    }
    return [];
  });
  const service = new FacultyWorkspacesService(
    dataSource as never,
    {} as never,
    {} as never,
    {} as never,
  );
  (
    service as unknown as { assertFacultyOwnsCourse: jest.Mock }
  ).assertFacultyOwnsCourse = jest.fn().mockResolvedValue(undefined);
  return { service, dataSource, manager };
}

describe('Faculty marks enrollment authorization', () => {
  it('writes marks only after tenant-and-course roster validation in one transaction', async () => {
    const { service, dataSource, manager } = createService();

    await expect(service.saveMarksDraft(facultyId, tenantId, draft())).resolves.toEqual({
      saved: 1,
      status: 'DRAFT',
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls[0][0]).toContain('FROM student_course_enrollments');
    expect(manager.query.mock.calls[0][0]).toContain("e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')");
    expect(manager.query.mock.calls[0][0]).toContain('e.deleted_at IS NULL');
    expect(manager.query.mock.calls[0][1]).toEqual([tenantId, courseId, [enrolledStudentId]]);
    expect(manager.query.mock.calls[1][0]).toContain('INSERT INTO academic_marks');
  });

  it.each([
    ['a student not enrolled in the course', [{ student_user_id: enrolledStudentId }]],
    ['a student from another tenant or course', []],
  ])('rejects %s without writing any marks', async (_label, enrolledRows) => {
    const { service, manager } = createService({ enrolledRows });

    await expect(
      service.saveMarksDraft(facultyId, tenantId, draft([enrolledStudentId, outsideStudentId])),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls[0][0]).toContain('student_course_enrollments');
  });

  it('rejects duplicate student IDs before opening a write transaction', async () => {
    const { service, dataSource, manager } = createService();

    await expect(
      service.saveMarksDraft(facultyId, tenantId, draft([enrolledStudentId, enrolledStudentId])),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('keeps the existing closed-window protection before a transaction begins', async () => {
    const { service, dataSource, manager } = createService({ session: null });

    await expect(service.saveMarksDraft(facultyId, tenantId, draft())).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('keeps the existing locked-marks protection before a transaction begins', async () => {
    const { service, dataSource, manager } = createService({ locked: true });

    await expect(service.saveMarksDraft(facultyId, tenantId, draft())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
  });
});
