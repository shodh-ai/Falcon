import { HrDashboardService } from './hr-dashboard.service';

describe('HrDashboardService pending review queues', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const approverId = '20000000-0000-4000-8000-000000000002';

  it('counts only the selected approver and entity, with distinct destinations', async () => {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes("sl.request_type IN ('LEAVE', 'ON_DUTY')")) return [{ count: '2' }];
      if (sql.includes("sl.request_type = 'REGULARIZATION'"))
        return [{ count: '1' }];
      if (sql.includes('FROM hr_resignation_requests rr\n'))
        return [{ count: '3' }];
      if (sql.includes('month_label')) return [];
      return [{}];
    });
    const entityFilterSql = jest
      .fn()
      .mockImplementation(
        (alias: string, index: number) => ` AND ${alias}.entity_id = $${index}`,
      );
    const service = new HrDashboardService(
      { query } as never,
      { entityFilterSql } as never,
    );

    const dashboard = await service.getMasterDashboard(tenantId, 7, approverId);
    expect(dashboard.pending_actions).toMatchObject({
      leave_approvals: 2,
      regularizations: 1,
      fnf_clearances: 3,
    });
    expect(dashboard.pending_actions.items.map((item) => item.href)).toEqual([
      '/hr/leaves',
      '/hr/regularizations',
      '/hr/offboarding?filter=fnf',
    ]);

    for (const type of ['LEAVE', 'REGULARIZATION']) {
      const [sql, params] = query.mock.calls.find(([statement]) =>
        type === 'LEAVE'
          ? statement.includes("sl.request_type IN ('LEAVE', 'ON_DUTY')")
          : statement.includes("sl.request_type = 'REGULARIZATION'"),
      );
      expect(sql).toContain('sl.current_approver_user_id = $3');
      expect(sql).toContain("sl.status IN ('PENDING', 'HOD_APPROVED')");
      expect(sql).toContain('hr_step.workflow_id = sl.workflow_id');
      expect(sql).toContain("hr_step.approver_type IN ('HR_ADMIN', 'HR_EXECUTIVE')");
      expect(sql).toContain('later_step.step_order > sl.current_step_order');
      expect(sql).toContain('p.entity_id = $2');
      expect(params).toEqual([tenantId, 7, approverId]);
    }

    expect(dashboard.pending_actions.items[0].label).toBe('Pending Leave / On-Duty Reviews');

    const [fnfSql, fnfParams] = query.mock.calls.find(([statement]) =>
      statement.includes(
        'COUNT(*)::text AS count FROM hr_resignation_requests rr',
      ),
    );
    expect(fnfSql).toContain("rr.status = 'FNF_PENDING'");
    expect(fnfSql).toContain(
      "rr.exit_status, 'PENDING_CLEARANCE') <> 'OFFBOARDED'",
    );
    expect(fnfSql).toContain('rr.entity_id = $2');
    expect(fnfParams).toEqual([tenantId, 7]);
  });
});
