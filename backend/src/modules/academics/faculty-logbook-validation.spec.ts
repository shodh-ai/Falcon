import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';

jest.mock('uuid', () => ({ v4: jest.fn() }));

describe('Faculty logbook validation and scope', () => {
  const facultyId = '10000000-0000-4000-8000-000000000001';
  const tenantId = '20000000-0000-4000-8000-000000000001';
  const courseId = '30000000-0000-4000-8000-000000000001';
  const valid = { course_id: courseId, class_date: '2026-10-19', topic_summary: 'Lecture coverage' };
  const query = jest.fn();
  const assertFacultyOwnsCourse = jest.fn();
  let service: FacultyWorkspacesService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = Object.assign(Object.create(FacultyWorkspacesService.prototype), {
      dataSource: { query },
      assertFacultyOwnsCourse,
    });
    assertFacultyOwnsCourse.mockResolvedValue(undefined);
    query.mockResolvedValue([{ logbook_id: 'existing-logbook' }]);
  });

  it('normalizes topic and preserves course, tenant, faculty and class date on save', async () => {
    await expect(service.createLogbookEntry(facultyId, tenantId, {
      ...valid,
      course_id: ` ${courseId} `,
      topic_summary: '  Thermodynamics: entropy  ',
    })).resolves.toEqual({ logbook_id: 'existing-logbook' });

    expect(assertFacultyOwnsCourse).toHaveBeenCalledWith(facultyId, tenantId, courseId);
    expect(query.mock.calls[0][1]).toEqual([
      tenantId, courseId, facultyId, valid.class_date, 'Thermodynamics: entropy',
    ]);
    expect(query.mock.calls[0][0]).toContain('RETURNING *, class_date::text AS class_date');
  });

  it.each(['', '   ', null, 42])('rejects an empty or non-text topic %p before querying', async topic => {
    await expect(service.createLogbookEntry(facultyId, tenantId, {
      ...valid, topic_summary: topic as string,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['', 'today', '19/10/2026', '2026-02-29', '2026-02-30', '2026-13-01', '0000-01-01', '2026-10-19T00:00:00Z'])
    ('rejects an invalid date-only class date %p before querying', async classDate => {
      await expect(service.createLogbookEntry(facultyId, tenantId, {
        ...valid, class_date: classDate,
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

  it('accepts a real leap day without changing the date', async () => {
    await service.createLogbookEntry(facultyId, tenantId, { ...valid, class_date: '2024-02-29' });
    expect(query.mock.calls[0][1][3]).toBe('2024-02-29');
  });

  it('rejects a malformed course without querying', async () => {
    await expect(service.createLogbookEntry(facultyId, tenantId, {
      ...valid, course_id: 'not-a-course-id',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(assertFacultyOwnsCourse).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('does not save when the faculty does not teach the course', async () => {
    assertFacultyOwnsCourse.mockRejectedValue(new ForbiddenException());
    await expect(service.createLogbookEntry(facultyId, tenantId, valid))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('qualifies an optional course filter and keeps reads scoped to the same faculty and tenant', async () => {
    await service.listLogbook(facultyId, tenantId, courseId);
    expect(query.mock.calls[0][1]).toEqual([tenantId, facultyId, courseId]);
    expect(query.mock.calls[0][0]).toContain('AND l.course_id = $3');
    expect(query.mock.calls[0][0]).toContain('c.tenant_id = l.tenant_id');
    expect(query.mock.calls[0][0]).toContain('l.tenant_id = $1 AND l.faculty_user_id = $2');
    expect(query.mock.calls[0][0]).toContain('l.class_date::text AS class_date');
  });

  it('allows historical own logbook entries to remain readable without a current course assignment', async () => {
    await service.listLogbook(facultyId, tenantId);
    expect(query.mock.calls[0][1]).toEqual([tenantId, facultyId]);
    expect(assertFacultyOwnsCourse).not.toHaveBeenCalled();
  });
});
