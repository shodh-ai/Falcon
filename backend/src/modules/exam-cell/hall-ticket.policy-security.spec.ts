import { ExamCellService } from './exam-cell.service';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
import { hallTicketWorkflowAvailability } from './hall-ticket-policy';

const tenant = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';

// Mocked boundaries only. No claim of issuance, approval or database locking.
describe('hall-ticket unresolved-policy safety interlock', () => {
  function fixture() {
    const query = jest.fn().mockResolvedValue([]);
    const finance = { getPendingDues: jest.fn() };
    const attendance = { evaluate: jest.fn() };
    const audit = { log: jest.fn() };
    const pdf = { generate: jest.fn() };
    const notify = { admitCardLocked: jest.fn() };
    return {
      query,
      finance,
      attendance,
      audit,
      pdf,
      notify,
      core: new ExamCellService(
        { query } as never,
        finance as never,
        pdf as never,
        notify as never,
        {} as never,
        attendance as never,
        {} as never,
        audit as never,
      ),
      enterprise: new ExamCellEnterpriseService(
        { query } as never,
        attendance as never,
        finance as never,
        audit as never,
      ),
    };
  }

  it('stops legacy generation before reads, PDFs, writes or notifications', async () => {
    const f = fixture();
    await expect(
      f.core.generateAdmitCards(
        tenant,
        { batch_label: 'Test', semester: 4 },
        actor,
      ),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'HALL_TICKET_POLICY_UNCONFIRMED' },
    });
    for (const call of [
      f.query,
      f.pdf.generate,
      f.notify.admitCardLocked,
      f.audit.log,
      f.finance.getPendingDues,
      f.attendance.evaluate,
    ])
      expect(call).not.toHaveBeenCalled();
  });

  it.each(['ExamCell', 'DeputyCOE', 'ExamAdmin', 'SuperAdmin'])(
    '%s broad generation permission cannot substitute for a stage policy',
    async (role) => {
      const f = fixture();
      const calls = [
        f.enterprise.syncHallTicketApprovals(tenant, 4, 'Test', role),
        f.enterprise.advanceHallTicketApproval(
          tenant,
          actor,
          actor,
          { action: 'APPROVE' },
          role,
        ),
        f.enterprise.advanceHallTicketApproval(
          tenant,
          actor,
          actor,
          { action: 'REJECT', reason: 'Required clearance is unresolved' },
          role,
        ),
        f.enterprise.bulkApproveHallTickets(
          tenant,
          actor,
          { session_id: tenant, approval_ids: [actor] },
          role,
        ),
      ];
      await Promise.all(
        calls.map((call) =>
          expect(call).rejects.toMatchObject({ status: 503 }),
        ),
      );
      expect(f.query).not.toHaveBeenCalled();
      expect(f.audit.log).not.toHaveBeenCalled();
      expect(f.finance.getPendingDues).not.toHaveBeenCalled();
    },
  );

  it.each(['ExamOperator', 'Student', 'Faculty', 'CampusAdmin', undefined])(
    'does not grant %s hall-ticket approval authority',
    async (role) => {
      const f = fixture();
      await expect(
        f.enterprise.syncHallTicketApprovals(tenant, 4, 'Test', role),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        f.enterprise.advanceHallTicketApproval(
          tenant,
          actor,
          actor,
          { action: 'APPROVE' },
          role,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        f.enterprise.bulkApproveHallTickets(
          tenant,
          actor,
          { session_id: tenant, approval_ids: [actor] },
          role,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(f.query).not.toHaveBeenCalled();
    },
  );

  it('recognizes the confirmed Finance role without enabling any approval or database writes', async () => {
    const f = fixture();
    await expect(
      f.enterprise.advanceHallTicketApproval(
        tenant,
        actor,
        actor,
        { action: 'APPROVE' },
        'Accountant',
      ),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'HALL_TICKET_POLICY_UNCONFIRMED' },
    });
    await expect(
      f.enterprise.bulkApproveHallTickets(
        tenant,
        actor,
        { session_id: tenant, approval_ids: [actor] },
        'Accountant',
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(f.query).not.toHaveBeenCalled();
    expect(f.audit.log).not.toHaveBeenCalled();
  });

  it.each(['stage', 'target_stage', 'approved_by', 'role', 'tenant_id'])(
    'rejects client-controlled %s even for a direct service call',
    async (field) => {
      const f = fixture();
      await expect(
        f.enterprise.advanceHallTicketApproval(
          tenant,
          actor,
          actor,
          { action: 'APPROVE', [field]: 'APPROVED' },
          'ExamCell',
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(f.query).not.toHaveBeenCalled();
      expect(f.audit.log).not.toHaveBeenCalled();
    },
  );

  it('rejects a direct rejection request without a reason before database access', async () => {
    const f = fixture();
    await expect(
      f.enterprise.advanceHallTicketApproval(
        tenant,
        actor,
        actor,
        { action: 'REJECT' },
        'ExamCell',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.query).not.toHaveBeenCalled();
  });

  it.each([
    { semester: 4, batch_label: 'Test', target_stage: 'COE' },
    { session_id: tenant, approval_ids: [] },
    { session_id: tenant, approval_ids: [actor, actor] },
    { session_id: tenant, approval_ids: [actor], target_stage: 'APPROVED' },
  ])(
    'rejects legacy or invalid bulk selectors %p without writes',
    async (dto) => {
      const f = fixture();
      await expect(
        f.enterprise.bulkApproveHallTickets(
          tenant,
          actor,
          dto as never,
          'ExamCell',
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(f.query).not.toHaveBeenCalled();
      expect(f.audit.log).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, '', ' ', 'not-a-tenant', 42])(
    'rejects invalid tenant %p before approval or read queries',
    async (value) => {
      const f = fixture();
      await expect(
        f.enterprise.syncHallTicketApprovals(
          value as never,
          4,
          'Test',
          'ExamCell',
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        f.enterprise.listHallTicketApprovals(value as never, {}),
      ).rejects.toMatchObject({ status: 403 });
      expect(f.query).not.toHaveBeenCalled();
    },
  );

  it('keeps tenant-scoped queue reads and exposes explicit unavailable actions', async () => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce([{ c: 1 }])
      .mockResolvedValueOnce([{ approval_id: actor, stage: 'APPROVED' }]);
    const queue = await f.enterprise.listHallTicketApprovals(tenant, {});
    expect(queue).toMatchObject({
      workflow: hallTicketWorkflowAvailability(),
      total: 1,
      data: [{ stage: 'APPROVED' }],
    });
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('u.tenant_id = a.tenant_id'),
      expect.arrayContaining([tenant]),
    );
    expect(
      f.query.mock.calls.every(
        ([sql]: [string]) => !/\b(INSERT|UPDATE|DELETE)\b/.test(sql),
      ),
    ).toBe(true);
  });

  it('does not turn a missing approval table into an apparently empty queue', async () => {
    const f = fixture();
    f.query.mockRejectedValue(
      new Error('relation hall_ticket_approvals does not exist'),
    );
    await expect(
      f.enterprise.listHallTicketApprovals(tenant, {}),
    ).rejects.toThrow('does not exist');
  });
});
