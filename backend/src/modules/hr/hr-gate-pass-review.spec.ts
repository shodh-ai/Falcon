import { HrService } from './hr.service';

describe('HR gate pass review safety', () => {
  function setup(status = 'PENDING_HR') {
    const pass = { pass_id: 'pass-1', tenant_id: 'tenant', staff_user_id: 'staff', reporting_officer_id: 'hod', status };
    const query = jest.fn(async (sql: string) => sql.includes('AS can_review')
      ? [{ ...pass, can_review: true }] : [{ entity_id: 7 }]);
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const notify = { gatePassUpdated: jest.fn() };
    const service = Object.assign(Object.create(HrService.prototype), {
      gatePasses: { findOne: jest.fn().mockResolvedValue(pass), update },
      users: { manager: { query }, findOne: jest.fn().mockResolvedValue({ tenant_id: 'tenant' }) },
      notify, workflowRouting: { getHrAdmin: jest.fn().mockResolvedValue({ userId: 'hr' }) },
    }) as HrService;
    return { service, query, update, notify, pass };
  }
  it('bounds the queue by tenant/entity/delegated department and allows only assigned independent HR decisions', async () => {
    const { service, query } = setup();
    await service.listHrGatePassReviews('tenant', 7, 'hr');
    expect(query.mock.calls[0][0]).toContain('pass.tenant_id = $1');
    expect(query.mock.calls[0][0]).toContain('COALESCE(profile.entity_id, employee.entity_id) = $2');
    expect(query.mock.calls[0][0]).toContain('access.department_scope');
    expect(query.mock.calls[0][0]).toContain('access.entity_scope');
    expect(query.mock.calls[0][0]).toContain('pass.reporting_officer_id IS DISTINCT FROM $3');
  });
  it.each(['APPROVED', 'REJECTED'] as const)('finalizes %s through a conditional update', async (status) => {
    const { service, update, notify } = setup();
    const result = await service.actOnGatePass('pass-1', 'hr', 'tenant', status, ['HRAdmin']);
    expect(result.status).toBe(status);
    expect(update).toHaveBeenCalledWith({ pass_id: 'pass-1', tenant_id: 'tenant', status: 'PENDING_HR' }, { status });
    expect(notify.gatePassUpdated).toHaveBeenCalledTimes(1);
  });
  it('rejects a concurrent decision without emitting a success notification', async () => {
    const { service, update, notify } = setup(); update.mockResolvedValue({ affected: 0 });
    await expect(service.actOnGatePass('pass-1', 'hr', 'tenant', 'APPROVED', ['HRAdmin'])).rejects.toThrow('changed');
    expect(notify.gatePassUpdated).not.toHaveBeenCalled();
  });
  it('denies self approval and the first approver finalizing their own decision', async () => {
    const { service, update } = setup();
    await expect(service.actOnGatePass('pass-1', 'staff', 'tenant', 'APPROVED', ['HRAdmin'])).rejects.toThrow('own gate pass');
    await expect(service.actOnGatePass('pass-1', 'hod', 'tenant', 'APPROVED', ['HRAdmin'])).rejects.toThrow('independent reviewer');
    expect(update).not.toHaveBeenCalled();
  });
  it('does not trust a stale HR token or an out-of-scope gate pass', async () => {
    const { service, query, update } = setup(); query.mockResolvedValue([]);
    await expect(service.actOnGatePass('pass-1', 'hr', 'tenant', 'APPROVED', ['HRAdmin'])).rejects.toThrow('Live HR access');
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects an invalid decision and an already finalized pass', async () => {
    const { service, update } = setup('APPROVED');
    await expect(service.actOnGatePass('pass-1', 'hr', 'tenant', 'PENDING' as never)).rejects.toThrow('status must be');
    await expect(service.actOnGatePass('pass-1', 'hr', 'tenant', 'APPROVED')).rejects.toThrow('Cannot act');
    expect(update).not.toHaveBeenCalled();
  });
});
