import { HrWorkforceService } from './hr-workforce.service';

describe('legacy HOD approval reconciliation', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const otherTenantId = '10000000-0000-4000-8000-000000000099';
  const entityId = 7;
  const adminId = '20000000-0000-4000-8000-000000000002';
  const hodId = '30000000-0000-4000-8000-000000000003';
  const leaveId = '40000000-0000-4000-8000-000000000004';
  const row = {
    leave_id: leaveId,
    tenant_id: tenantId,
    staff_user_id: '50000000-0000-4000-8000-000000000005',
    entity_id: entityId,
    request_type: 'LEAVE',
    leave_type: 'CL',
    workflow_id: '60000000-0000-4000-8000-000000000006',
    status: 'HOD_APPROVED',
    current_step_order: 2,
    current_approver_user_id: '70000000-0000-4000-8000-000000000007',
    start_date: '2026-10-14',
    end_date: '2026-10-15',
    reason: 'Family appointment',
    applied_at: new Date('2026-10-10T10:00:00Z'),
  };

  function makeService(query: jest.Mock) {
    const manager = { query };
    const transaction = jest.fn(async (callback: (manager: unknown) => Promise<unknown>) =>
      callback(manager),
    );
    const users = { manager: { query, connection: { query, transaction } } };
    const service = new HrWorkforceService(
      {} as never, {} as never, {} as never, {} as never,
      {} as never, users as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
    );
    return { service, transaction };
  }

  function successfulQuery(sql: string): unknown[] {
    if (sql.includes('SELECT DISTINCT role_name')) return [{ role_name: 'HRAdmin' }];
    if (sql.includes('FOR UPDATE OF r')) return [row];
    if (sql.includes('FROM hr_employee_profiles p')) return [{ entity_id: entityId }];
    if (sql.includes('SELECT decision_id FROM hr_staff_request_decisions')) return [];
    if (sql.includes('FROM hr_approval_workflows workflow')) {
      return [{ current_type: 'HR_ADMIN', current_ref: null,
        previous_order: 1, previous_type: 'REPORTING_MANAGER' }];
    }
    if (sql.includes('SELECT CASE WHEN')) return [{ approver_user_id: hodId }];
    if (sql.includes('SELECT approver.user_id FROM users approver')) return [{ user_id: hodId }];
    if (sql.includes('UPDATE staff_leave_requests')) {
      return [{ leave_id: leaveId, status: 'PENDING',
        current_step_order: 1, current_approver_user_id: hodId }];
    }
    if (sql.includes('INSERT INTO hr_staff_request_reconciliations')) {
      return [{ reconciliation_id: '80000000-0000-4000-8000-000000000008' }];
    }
    return [];
  }

  it('reroutes a scoped legacy case to fresh HOD review without inventing an approval', async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => successfulQuery(sql));
    const { service, transaction } = makeService(query);
    const result = await service.reconcileLegacyHodApproval(
      adminId, tenantId, entityId, leaveId,
      'Original approval actor cannot be verified', 'case-file-123',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      leave_id: leaveId, status: 'PENDING', current_step_order: 1,
      current_approver_user_id: hodId,
      reconciliation_id: '80000000-0000-4000-8000-000000000008',
    });
    expect(query.mock.calls.find(([sql]) => String(sql).includes('FOR UPDATE OF r'))?.[1])
      .toEqual([tenantId, leaveId]);
    expect(query.mock.calls.find(([sql]) => String(sql).includes('FROM hr_employee_profiles p'))?.[1])
      .toEqual([tenantId, row.staff_user_id, entityId]);
    expect(query.mock.calls.find(([sql]) => String(sql).includes('UPDATE staff_leave_requests'))?.[0])
      .toContain("status = 'PENDING'");
    expect(query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO hr_staff_request_reconciliations'))?.[1])
      .toEqual([
        tenantId, entityId, leaveId, adminId, 'HOD_APPROVED', 2,
        row.current_approver_user_id, 1, hodId,
        'Original approval actor cannot be verified', 'case-file-123',
      ]);
    expect(query.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO hr_staff_request_decisions'))).toBe(false);
  });

  it('rejects a demoted HR user despite a formerly privileged session', async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) =>
      sql.includes('SELECT DISTINCT role_name') ? [{ role_name: 'HR' }] : successfulQuery(sql),
    );
    const { service } = makeService(query);
    await expect(service.reconcileLegacyHodApproval(
      adminId, tenantId, entityId, leaveId,
      'Original approval actor cannot be verified',
    )).rejects.toThrow('Current HR administrator role is required');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('FOR UPDATE OF r'))).toBe(false);
  });

  it('does not read or mutate a request outside the selected tenant/entity', async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FOR UPDATE OF r')) return [];
      return successfulQuery(sql);
    });
    const { service } = makeService(query);
    await expect(service.reconcileLegacyHodApproval(
      adminId, otherTenantId, entityId, leaveId,
      'Original approval actor cannot be verified',
    )).rejects.toThrow('Request not found');
    expect(query.mock.calls.find(([sql]) => String(sql).includes('FOR UPDATE OF r'))?.[1])
      .toEqual([otherTenantId, leaveId]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE staff_leave_requests'))).toBe(false);
  });

  it('does not reroute a case that already has a real decision record', async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) =>
      sql.includes('SELECT decision_id FROM hr_staff_request_decisions')
        ? [{ decision_id: 'existing' }]
        : successfulQuery(sql),
    );
    const { service } = makeService(query);
    await expect(service.reconcileLegacyHodApproval(
      adminId, tenantId, entityId, leaveId,
      'Original approval actor cannot be verified',
    )).rejects.toThrow('already has verifiable approval history');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE staff_leave_requests'))).toBe(false);
  });

  it('fails closed when a competing transition wins the compare-and-swap', async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) =>
      sql.includes('UPDATE staff_leave_requests') ? [] : successfulQuery(sql),
    );
    const { service } = makeService(query);
    await expect(service.reconcileLegacyHodApproval(
      adminId, tenantId, entityId, leaveId,
      'Original approval actor cannot be verified',
    )).rejects.toThrow('Request changed during reconciliation');
    expect(query.mock.calls.find(([sql]) => String(sql).includes('UPDATE staff_leave_requests'))?.[0])
      .toContain('current_approver_user_id IS NOT DISTINCT FROM');
    expect(query.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO hr_staff_request_reconciliations'))).toBe(false);
  });

  it('leaves ambiguous non-manager workflows visible but not eligible to reroute', async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT r.leave_id, r.tenant_id') && sql.includes('ORDER BY r.applied_at')) {
        return [{ ...row, employee_name: 'Employee', employee_id: 'E-1' }];
      }
      if (sql.includes('FROM hr_approval_workflows workflow')) {
        return [{ current_type: 'HR_ADMIN', current_ref: null,
          previous_order: 1, previous_type: 'SPECIFIC_USER' }];
      }
      return successfulQuery(sql);
    });
    const { service } = makeService(query);
    const result = await service.listLegacyHodReconciliations(
      tenantId, entityId, adminId,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      leave_id: leaveId, can_reconcile: false,
      block_reason: 'Prior workflow step is not a manager/HOD approval',
    });
    expect(query.mock.calls.find(([sql]) => String(sql).includes('ORDER BY r.applied_at'))?.[0])
      .toContain('p.entity_id = $2');
  });

  it('requires the new manager/HOD to be active in the selected tenant/entity', async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) =>
      sql.includes('SELECT approver.user_id FROM users approver') ? [] : successfulQuery(sql),
    );
    const { service } = makeService(query);
    await expect(service.reconcileLegacyHodApproval(
      adminId, tenantId, entityId, leaveId,
      'Original approval actor cannot be verified',
    )).rejects.toThrow('outside this tenant/entity');
    const [candidateSql, candidateParams] = query.mock.calls.find(([sql]) =>
      String(sql).includes('SELECT approver.user_id FROM users approver'))!;
    expect(candidateSql).toContain('approver_profile.entity_id = $3');
    expect(candidateParams).toEqual([hodId, tenantId, entityId]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE staff_leave_requests'))).toBe(false);
  });

  it('rejects a manager who is also the reconciling HR administrator or previous HR approver', async () => {
    for (const candidateId of [adminId, row.current_approver_user_id]) {
      const query = jest.fn(async (sql: string, _params?: unknown[]) =>
        sql.includes('SELECT CASE WHEN')
          ? [{ approver_user_id: candidateId }]
          : successfulQuery(sql),
      );
      const { service } = makeService(query);
      await expect(service.reconcileLegacyHodApproval(
        adminId, tenantId, entityId, leaveId,
        'Original approval actor cannot be verified',
      )).rejects.toThrow('must be independent');
      expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE staff_leave_requests'))).toBe(false);
    }
  });
});
