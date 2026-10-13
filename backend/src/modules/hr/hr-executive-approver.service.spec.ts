import { HrAccessControlService } from './hr-access-control.service';

describe('HR executive approver eligibility', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const requesterId = '20000000-0000-4000-8000-000000000002';
  const candidateId = '30000000-0000-4000-8000-000000000003';

  it('rejects a specifically delegated approver with no HR role', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new HrAccessControlService(
      { query } as never,
      {} as never,
    );
    jest.spyOn(service, 'getUserModuleAccess').mockResolvedValue({
      can_approve: true,
    } as never);
    await expect(
      service.resolveHrExecutiveApprover(
        tenantId, requesterId, 'LEAVES', candidateId,
      ),
    ).resolves.toBeNull();
    expect(query.mock.calls[0][0]).toContain(
      "primary_role.role_name IN ('HR', 'HRAdmin', 'SuperAdmin')",
    );
    expect(query.mock.calls[0][1]).toEqual([tenantId, candidateId]);
  });

  it('limits automatic delegated selection to HR roles and excludes the requester', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ dept_id: 9 }])
      .mockResolvedValueOnce([{ user_id: candidateId }]);
    const service = new HrAccessControlService(
      { query } as never,
      {} as never,
    );
    await expect(
      service.resolveHrExecutiveApprover(tenantId, requesterId, 'LEAVES'),
    ).resolves.toBe(candidateId);
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain("primary_role.role_name IN ('HR', 'HRAdmin', 'SuperAdmin')");
    expect(sql).toContain('u.user_id <> $4');
    expect(sql).toContain('u.user_id <> $5');
    expect(params).toEqual([tenantId, 'LEAVES', 9, requesterId, null]);
  });

  it('rejects a demoted assignee at a configured ROLE HR final step', async () => {
    const service = new HrAccessControlService(
      { query: jest.fn() } as never,
      {} as never,
    );
    await expect(service.assertWorkflowApproverPower(
      tenantId, candidateId, ['HOD'], 'ROLE:HR', 'LEAVE',
    )).rejects.toThrow('Current HR role is required');
    // A broad non-HR master role must not bypass the role pinned to this step.
    await expect(service.assertWorkflowApproverPower(
      tenantId, candidateId, ['President'], 'ROLE:HR', 'LEAVE',
    )).rejects.toThrow('Current HR role is required');
    await expect(service.assertWorkflowApproverPower(
      tenantId, candidateId, ['HRAdmin'], 'ROLE:HR', 'LEAVE',
    )).resolves.toBeUndefined();
  });
});
