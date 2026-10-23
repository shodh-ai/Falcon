import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';
import type { SaveMarksDraftDto } from './dto/save-marks-draft.dto';

jest.mock('uuid', () => ({ v4: jest.fn() }));

describe('Faculty marks draft safeguards', () => {
  const faculty = '10000000-0000-4000-8000-000000000001';
  const tenant = '20000000-0000-4000-8000-000000000001';
  const course = '30000000-0000-4000-8000-000000000001';
  const student = '40000000-0000-4000-8000-000000000001';
  const otherStudent = '40000000-0000-4000-8000-000000000002';
  const query = jest.fn();
  const transactionQuery = jest.fn();
  const transaction = jest.fn();
  const assertFacultyOwnsCourse = jest.fn();
  let service: FacultyWorkspacesService;
  const draft = (): SaveMarksDraftDto => ({
    course_id: course, exam_type: 'GA1', max_marks: 100,
    entries: [{ student_user_id: student, marks_obtained: 3 }],
  });

  beforeEach(() => {
    jest.resetAllMocks();
    service = Object.assign(Object.create(FacultyWorkspacesService.prototype), {
      dataSource: { query, transaction }, assertFacultyOwnsCourse,
    });
    query.mockResolvedValue([]);
    transaction.mockImplementation(async (work) => work({ query: transactionQuery }));
    transactionQuery.mockResolvedValue([{ student_user_id: student }]);
  });

  it('uses the server maximum and validates the exact tenant and course enrollment before saving', async () => {
    await expect(service.saveMarksDraft(faculty, tenant, draft())).resolves.toEqual({ saved: 1, status: 'DRAFT' });
    expect(assertFacultyOwnsCourse).toHaveBeenCalledWith(faculty, tenant, course);
    expect(transactionQuery.mock.calls[0][1]).toEqual([tenant, course, [student]]);
    expect(transactionQuery.mock.calls[0][0]).toContain("status = 'ENROLLED'");
    expect(transactionQuery.mock.calls[0][0]).toContain("to_jsonb(student_course_enrollments)->>'deleted_at'");
    expect(transactionQuery.mock.calls[0][0]).toContain('FOR SHARE');
    expect(transactionQuery.mock.calls[1][1]).toEqual([tenant, course, 'GA1', 5, faculty, student, 3, null]);
  });

  it('rejects the entire batch when one student is not enrolled, without writing any marks', async () => {
    const dto = draft();
    dto.entries.push({ student_user_id: otherStudent, marks_obtained: 4 });
    await expect(service.saveMarksDraft(faculty, tenant, dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(transactionQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate students before opening a write transaction', async () => {
    const dto = draft();
    dto.entries.push({ ...dto.entries[0] });
    await expect(service.saveMarksDraft(faculty, tenant, dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -1, 6])('rejects an invalid GA1 mark %p before writing', async (mark) => {
    const dto = draft();
    dto.entries[0].marks_obtained = mark;
    await expect(service.saveMarksDraft(faculty, tenant, dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a locked component before starting a write', async () => {
    query.mockResolvedValue([{ exists: 1 }]);
    await expect(service.saveMarksDraft(faculty, tenant, draft())).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('throws inside the transaction if a concurrent publication locks a row, rolling back the batch', async () => {
    transactionQuery.mockResolvedValueOnce([{ student_user_id: student }]).mockResolvedValueOnce([]);
    let rolledBack = false;
    transaction.mockImplementation(async (work) => {
      try { return await work({ query: transactionQuery }); }
      catch (error) { rolledBack = true; throw error; }
    });
    await expect(service.saveMarksDraft(faculty, tenant, draft())).rejects.toBeInstanceOf(ForbiddenException);
    expect(rolledBack).toBe(true);
    // The conflict predicate protects the whole row, including its maximum and uploader.
    expect(transactionQuery.mock.calls[1][0]).toContain("WHERE academic_marks.status NOT IN ('PENDING_COE', 'PUBLISHED')");
  });

  it('does not bypass course ownership or manually write auto-synced weekly tests', async () => {
    assertFacultyOwnsCourse.mockRejectedValue(new ForbiddenException());
    await expect(service.saveMarksDraft(faculty, tenant, draft())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.saveMarksDraft(faculty, tenant, { ...draft(), exam_type: 'WT1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
