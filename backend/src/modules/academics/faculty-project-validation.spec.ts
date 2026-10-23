import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';
import { AcademicsController } from './academics.controller';

// The controller imports unrelated upload handlers that depend on ESM-only uuid.
// Project validation never invokes that dependency.
jest.mock('uuid', () => ({ v4: jest.fn() }));

const tenant = '10000000-0000-4000-8000-000000000001';
const faculty = '20000000-0000-4000-8000-000000000001';
const otherFaculty = '20000000-0000-4000-8000-000000000002';
const student = '30000000-0000-4000-8000-000000000001';
const outsideStudent = '30000000-0000-4000-8000-000000000002';

describe('faculty research and project validation', () => {
  const query = jest.fn();
  const runner = {
    connect: jest.fn(), startTransaction: jest.fn(), query: jest.fn(),
    commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn(),
  };
  const createQueryRunner = jest.fn(() => runner);
  let service: FacultyWorkspacesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = Object.assign(Object.create(FacultyWorkspacesService.prototype), {
      dataSource: { query, createQueryRunner }, notify: {},
    });
  });

  it('normalizes a blank optional publication date to null', async () => {
    query.mockResolvedValueOnce([{ research_id: 'mock-record' }]);
    await service.createResearchLog(faculty, tenant, { publication_title: '  Test publication  ', published_date: '' });
    expect(query.mock.calls[0][1]).toEqual([tenant, faculty, 'Test publication', null, null, 'JOURNAL', null, null]);
  });

  it('rejects whitespace-only publication titles before querying', async () => {
    await expect(service.createResearchLog(faculty, tenant, { publication_title: '  ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a faculty ID that does not belong to the active tenant', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.assignProjectGuide(otherFaculty, tenant, { project_title: 'Test project', student_ids: [] })).rejects.toBeInstanceOf(BadRequestException);
    expect(query.mock.calls[0][1]).toEqual([otherFaculty, tenant]);
    expect(query.mock.calls[0][0]).toContain('u.deleted_at IS NULL');
    expect(createQueryRunner).not.toHaveBeenCalled();
  });

  it('rejects project members outside the tenant or student role before inserting any project', async () => {
    query.mockResolvedValueOnce([{ user_id: faculty }]).mockResolvedValueOnce([{ user_id: student }]);
    await expect(service.assignProjectGuide(faculty, tenant, { project_title: 'Test project', student_ids: [student, outsideStudent] })).rejects.toBeInstanceOf(BadRequestException);
    expect(query.mock.calls[1][1]).toEqual([tenant, [student, outsideStudent]]);
    expect(query.mock.calls[1][0]).toContain("r.role_name = 'Student'");
    expect(query.mock.calls[1][0]).toContain('u.deleted_at IS NULL');
    expect(createQueryRunner).not.toHaveBeenCalled();
  });

  it('rejects duplicate project members', async () => {
    query.mockResolvedValueOnce([{ user_id: faculty }]);
    await expect(service.assignProjectGuide(faculty, tenant, { project_title: 'Test project', student_ids: [student, student] })).rejects.toBeInstanceOf(BadRequestException);
    expect(createQueryRunner).not.toHaveBeenCalled();
  });

  it('validates replacement students before deleting the existing roster', async () => {
    query.mockResolvedValueOnce([{ exists: 1 }]).mockResolvedValueOnce([]);
    await expect(service.updateProjectStudents('guide-test', faculty, tenant, [{ student_user_id: outsideStudent }])).rejects.toBeInstanceOf(BadRequestException);
    expect(createQueryRunner).not.toHaveBeenCalled();
  });

  it('creates a project after validating its faculty and students', async () => {
    query.mockResolvedValueOnce([{ user_id: faculty }])
      .mockResolvedValueOnce([{ user_id: student }])
      .mockResolvedValueOnce([{ active_count: '0' }]);
    const result = await service.assignProjectGuide(faculty, tenant, { project_title: '  Test project  ', student_ids: [student] });
    expect(result.guide_id).toBeDefined();
    expect(runner.query.mock.calls[0][1][3]).toBe('Test project');
    expect(runner.query.mock.calls[1][1]).toEqual([result.guide_id, student, tenant]);
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid funding amount %s without querying or notifying', async (amount) => {
    await expect(service.requestFunding('guide-test', faculty, tenant, amount, 'Test purpose')).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects empty funding purpose', async () => {
    await expect(service.requestFunding('guide-test', faculty, tenant, 10, '   ')).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('faculty project assignment controller', () => {
  const assignProjectGuide = jest.fn();
  const controller = Object.assign(Object.create(AcademicsController.prototype), { facultyWorkspaces: { assignProjectGuide } }) as AcademicsController;

  beforeEach(() => jest.clearAllMocks());

  it('does not allow Faculty to assign a project to another faculty account', () => {
    expect(() => controller.assignProjectGuide({ user: { user_id: faculty, tenant_id: tenant, role: 'Faculty' } }, {
      faculty_user_id: otherFaculty, project_title: 'Test project', student_ids: [],
    })).toThrow(ForbiddenException);
    expect(assignProjectGuide).not.toHaveBeenCalled();
  });

  it('still allows a faculty member to create their own project', () => {
    controller.assignProjectGuide({ user: { user_id: faculty, tenant_id: tenant, role: 'Faculty' } }, {
      project_title: 'Test project', student_ids: [],
    });
    expect(assignProjectGuide).toHaveBeenCalledWith(faculty, tenant, expect.objectContaining({ project_title: 'Test project' }));
  });
});
