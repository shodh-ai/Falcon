import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AcademicRndService } from './academic-rnd.service';

describe('research grant guide decision boundaries', () => {
  const tenant = '10000000-0000-4000-8000-000000000001';
  const faculty = '20000000-0000-4000-8000-000000000001';
  const applicationId = '30000000-0000-4000-8000-000000000001';
  const actorQuery = jest.fn();
  const query = jest.fn();
  const transaction = jest.fn();
  const notifyStudent = jest.fn();
  let application: Record<string, unknown>;
  let service: AcademicRndService;

  beforeEach(() => {
    jest.resetAllMocks();
    application = { application_id: applicationId, tenant_id: tenant, student_user_id: 'student',
      guide_faculty_user_id: faculty, status: 'PENDING_GUIDE', project_title: 'Test research' };
    actorQuery.mockResolvedValue([{ tenant_id: tenant }]);
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT a.*')) return [{ ...application }];
      if (sql.startsWith('UPDATE academic_rnd_applications')) return [{ ...application, status: params[3] }];
      return [];
    });
    transaction.mockImplementation((run: any) => run({ query }));
    service = Object.assign(Object.create(AcademicRndService.prototype), { db: { query: actorQuery, transaction }, notifyStudent });
  });

  it.each([undefined, 'another-tenant'])('fails closed for missing active actor or mismatched tenant (%s)', async authTenant => {
    if (!authTenant) actorQuery.mockResolvedValueOnce([]);
    await expect(service.approveGuide(authTenant, faculty, applicationId, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
    expect(notifyStudent).not.toHaveBeenCalled();
  });

  it('derives the actor tenant when absent rather than using the default campus', async () => {
    await service.listGuideQueue(undefined, faculty);
    const [sql, params] = actorQuery.mock.calls[1];
    expect(params).toEqual([tenant, faculty]);
    expect(sql).toContain('u.tenant_id = a.tenant_id');
    expect(sql).toContain('c.tenant_id = a.tenant_id');
    expect(sql).toContain("a.status = 'PENDING_GUIDE'");
  });

  it.each(['', '   ', 42])('rejects a blank or malformed rejection reason %p before querying', async remarks => {
    await expect(service.rejectGuide(tenant, faculty, applicationId, remarks as string)).rejects.toBeInstanceOf(BadRequestException);
    expect(actorQuery).not.toHaveBeenCalled();
  });

  it('rejects an invalid application identifier before querying', async () => {
    await expect(service.approveGuide(tenant, faculty, 'not-an-id', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(actorQuery).not.toHaveBeenCalled();
  });

  it('locks application ownership and writes the decision and audit in one transaction', async () => {
    await service.approveGuide(tenant, faculty, applicationId, { remarks: '  Approved research  ' });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE OF a');
    expect(query.mock.calls[1][0]).toContain('(guide_faculty_user_id = $3 OR guide_faculty_user_id IS NULL)');
    expect(query.mock.calls[2][1]).toEqual([tenant, applicationId, faculty, 'APPROVED', 'Approved research']);
    expect(notifyStudent).toHaveBeenCalledTimes(1);
  });

  it('trims a rejection reason in both its audit and notification', async () => {
    await service.rejectGuide(tenant, faculty, applicationId, '  Missing methodology  ');
    expect(query.mock.calls[1][1][3]).toBe('GUIDE_REJECTED');
    expect(query.mock.calls[2][1]).toEqual([tenant, applicationId, faculty, 'REJECTED', 'Missing methodology']);
    expect(notifyStudent.mock.calls[0][3]).toContain('Remarks: Missing methodology');
  });

  it.each([true, false])('unwraps PostgreSQL UPDATE [rows, count] for guide decision %s', async approved => {
    const status = approved ? 'PENDING_BUDGET' : 'GUIDE_REJECTED';
    const updated = { ...application, status };
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT a.*')) return [{ ...application }];
      if (sql.startsWith('UPDATE')) return [[updated], 1];
      return [];
    });
    const action = approved ? service.approveGuide(tenant, faculty, applicationId, {})
      : service.rejectGuide(tenant, faculty, applicationId, 'Test rejection');
    await expect(action).resolves.toEqual(updated);
    expect(notifyStudent).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[2][1][3]).toBe(approved ? 'APPROVED' : 'REJECTED');
  });

  it.each([true, false])('rejects empty PostgreSQL UPDATE tuples without audit or notification (%s)', async approved => {
    query.mockImplementation(async (sql: string) => sql.startsWith('SELECT a.*') ? [{ ...application }] : [[], 0]);
    const action = approved ? service.approveGuide(tenant, faculty, applicationId, {})
      : service.rejectGuide(tenant, faculty, applicationId, 'Test rejection');
    await expect(action).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
    expect(notifyStudent).not.toHaveBeenCalled();
  });

  it.each([true, false])('does not audit or notify a stale concurrent decision (%s)', async approved => {
    query.mockImplementation(async (sql: string) => sql.startsWith('SELECT a.*') ? [{ ...application }] : []);
    const action = approved ? service.approveGuide(tenant, faculty, applicationId, {}) : service.rejectGuide(tenant, faculty, applicationId, 'Reason');
    await expect(action).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
    expect(notifyStudent).not.toHaveBeenCalled();
  });

  it('does not notify when the audit insert fails inside the transaction', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT a.*')) return [{ ...application }];
      if (sql.startsWith('UPDATE')) return [{ ...application, status: 'PENDING_BUDGET' }];
      throw new Error('Audit storage unavailable');
    });
    await expect(service.approveGuide(tenant, faculty, applicationId, {})).rejects.toThrow('Audit storage unavailable');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(notifyStudent).not.toHaveBeenCalled();
  });

  it('does not overwrite a case already advanced beyond guide review', async () => {
    application.status = 'PENDING_BUDGET';
    await expect(service.approveGuide(tenant, faculty, applicationId, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(notifyStudent).not.toHaveBeenCalled();
  });

  it('does not expose or decide an application outside the scoped student tenant', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.approveGuide(tenant, faculty, applicationId, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(query.mock.calls[0][0]).toContain('u.tenant_id = a.tenant_id');
    expect(notifyStudent).not.toHaveBeenCalled();
  });
});
