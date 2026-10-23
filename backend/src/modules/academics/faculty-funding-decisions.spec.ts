import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';

describe('Faculty funding decision boundaries', () => {
  function setup() {
    const query = jest.fn();
    const approvalRequired = jest.fn();
    const logAction = jest.fn();
    const service = Object.assign(Object.create(FacultyWorkspacesService.prototype), {
      dataSource: { query }, notify: { approvalRequired }, deanAudit: { logAction },
    }) as FacultyWorkspacesService;
    return { service, query, approvalRequired, logAction };
  }

  it.each(['APPROVED_DEAN', 'REJECTED_DEAN', 'PENDING_HOD', '', null, undefined])(
    'rejects an invalid HOD stage %p before accessing or writing requests', async status => {
      const { service, query, approvalRequired, logAction } = setup();
      await expect(service.updateHodFundingRequest('request', status as never, 'Reason', 'hod', 'tenant')).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
      expect(approvalRequired).not.toHaveBeenCalled();
      expect(logAction).not.toHaveBeenCalled();
    },
  );

  it.each(['APPROVED_HOD', 'REJECTED_HOD', 'PENDING_HOD', '', null, undefined])(
    'rejects an invalid Dean stage %p before accessing or writing requests', async status => {
      const { service, query, approvalRequired, logAction } = setup();
      await expect(service.updateDeanFundingRequest('request', status as never, 'Reason', 'dean', 'tenant')).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
      expect(approvalRequired).not.toHaveBeenCalled();
      expect(logAction).not.toHaveBeenCalled();
    },
  );

  it.each(['hod', 'dean'] as const)('requires a nonblank %s rejection reason at the service boundary', async role => {
    const { service, query } = setup();
    await expect(role === 'hod'
      ? service.updateHodFundingRequest('request', 'REJECTED_HOD', ' \n\t ', 'hod', 'tenant')
      : service.updateDeanFundingRequest('request', 'REJECTED_DEAN', ' \n\t ', 'dean', 'tenant'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['hod', 'dean'] as const)('rejects a non-text %s decision message before any writes', async role => {
    const { service, query } = setup();
    await expect(role === 'hod'
      ? service.updateHodFundingRequest('request', 'APPROVED_HOD', {} as never, 'hod', 'tenant')
      : service.updateDeanFundingRequest('request', 'APPROVED_DEAN', {} as never, 'dean', 'tenant'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['hod', 'APPROVED_HOD', 'PENDING_HOD'],
    ['hod', 'REJECTED_HOD', 'PENDING_HOD'],
    ['dean', 'APPROVED_DEAN', 'APPROVED_HOD'],
    ['dean', 'REJECTED_DEAN', 'APPROVED_HOD'],
  ] as const)('saves the allowed %s decision %s with tenant scope and a trimmed reason', async (role, status, previous) => {
    const { service, query, logAction } = setup();
    const saved = { request_id: 'request', status, amount: 100 };
    query.mockResolvedValueOnce([{ dept_id: 2 }]).mockResolvedValueOnce([[saved], 1]).mockResolvedValue([]);
    await expect(role === 'hod'
      ? service.updateHodFundingRequest('request', status as never, '  Valid reason  ', 'hod', 'tenant')
      : service.updateDeanFundingRequest('request', status as never, '  Valid reason  ', 'dean', 'tenant'))
      .resolves.toEqual(saved);
    expect(query.mock.calls[1][0]).toContain(`fr.status = '${previous}'`);
    expect(query.mock.calls[1][0]).toContain('u.tenant_id = fr.tenant_id');
    expect(query.mock.calls[1][1]).toEqual([status, 'Valid reason', role, 'request', 'tenant', [2]]);
    if (role === 'dean') expect(logAction).toHaveBeenCalledWith(expect.objectContaining({ newValue: expect.objectContaining({ commit_message: 'Valid reason' }) }));
  });

  it.each(['hod', 'dean'] as const)('preserves the optional empty comment for a %s approval', async role => {
    const { service, query } = setup();
    query.mockResolvedValueOnce([{ dept_id: 2 }]).mockResolvedValueOnce([[{ request_id: 'request', amount: 100 }], 1]).mockResolvedValue([]);
    await (role === 'hod'
      ? service.updateHodFundingRequest('request', 'APPROVED_HOD', undefined as never, 'hod', 'tenant')
      : service.updateDeanFundingRequest('request', 'APPROVED_DEAN', undefined as never, 'dean', 'tenant'));
    expect(query.mock.calls[1][1][1]).toBe('');
  });

  it.each(['hod', 'dean'] as const)('does not notify or audit a stale %s decision that saves no row', async role => {
    const { service, query, approvalRequired, logAction } = setup();
    query.mockResolvedValueOnce([{ dept_id: 2 }]).mockResolvedValueOnce([[], 0]);
    await expect(role === 'hod'
      ? service.updateHodFundingRequest('request', 'APPROVED_HOD', '', 'hod', 'tenant')
      : service.updateDeanFundingRequest('request', 'APPROVED_DEAN', '', 'dean', 'tenant'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(approvalRequired).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });

  it.each(['hod', 'dean'] as const)('keeps the %s funding queue requestor and project in the request tenant', async role => {
    const { service, query } = setup();
    query.mockResolvedValue([{ dept_id: 2 }]);
    if (role === 'hod') await service.listHodFundingRequests('hod', 'tenant');
    else await service.listDeanFundingRequests('tenant', 'dean');
    const sql = query.mock.calls[role === 'hod' ? 0 : 1][0];
    expect(sql).toContain('g.tenant_id = fr.tenant_id');
    expect(sql).toContain('u.tenant_id = fr.tenant_id');
  });
});
