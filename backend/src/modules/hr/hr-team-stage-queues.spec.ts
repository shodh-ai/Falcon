import { HrTeamService } from './hr-team.service';

describe('HR manager and override queue stage separation', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const approverId = '20000000-0000-4000-8000-000000000002';

  function makeService() {
    const query = jest.fn().mockResolvedValue([]);
    const scope = {
      listScopedUsers: jest.fn().mockResolvedValue([{ user_id: 'staff-id' }]),
      scopeUserFilterSql: jest.fn().mockReturnValue({ clause: '', params: [] }),
    };
    const service = new HrTeamService(
      { query } as never,
      scope as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, query };
  }

  it('excludes final HR steps from manager request counts and rows', async () => {
    const { service, query } = makeService();
    await service.getPendingCounts(approverId, tenantId, undefined, ['HOD']);
    expect(query.mock.calls[0][0]).toContain('AND NOT (r.request_type IN');
    expect(query.mock.calls[0][0]).toContain('hr_step.workflow_id = r.workflow_id');

    query.mockClear();
    await service.listTeamRequests(approverId, tenantId, undefined, 'LEAVE', ['HOD']);
    expect(query.mock.calls[0][0]).toContain('AND NOT (r.request_type IN');
    expect(query.mock.calls[0][0]).toContain("hr_step.approver_type IN ('HR_ADMIN', 'HR_EXECUTIVE')");
  });

  it('shows both stages in the scoped supervisory queue without making the prior actor a final approver', async () => {
    const { service, query } = makeService();
    await service.listAllPendingForAdmin(tenantId, 7, approverId);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("THEN 'FINAL_HR' ELSE 'FIRST_LEVEL'");
    expect(sql).toContain('AS can_override_approve');
    expect(sql).toContain('prior.actor_user_id = $3');
    expect(sql).toContain('access.department_scope');
    expect(sql).toContain('COALESCE(r.entity_id, p.entity_id, u.entity_id) = $2');
    expect(sql).toContain('r.current_step_order');
    expect(params).toEqual([tenantId, 7, approverId]);
  });
});
