import { DataSource } from 'typeorm';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
import { HallTicketDecisionService } from './hall-ticket-decision.service';

const tenant = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const session = '44444444-4444-4444-8444-444444444444';
const registration = '55555555-5555-4555-8555-555555555555';
const student = '66666666-6666-4666-8666-666666666666';
const windowId = '77777777-7777-4777-8777-777777777777';

// Mocked boundaries; database rollback and locking are tested separately.
describe('Hall Ticket scoped decisions', () => {
  function fixture() {
    const row = {
      approval_id: id,
      registration_id: registration,
      session_id: session,
      student_user_id: student,
      semester: 4,
      stage: 'ELIGIBILITY',
      eligibility_status: 'PENDING',
      finance_status: 'PENDING',
      exam_office_status: 'PENDING',
      coe_status: 'PENDING',
      approved_by: null,
      approved_at: null,
      block_reasons: [],
    };
    const reg = {
      registration_id: registration,
      window_id: windowId,
      student_user_id: student,
      session_id: session,
      semester: 4,
      status: 'APPROVED',
      reviewed_by: actor,
      reviewed_at: '2026-01-01',
    };
    const query = jest.fn((sql: string) => {
      if (sql.startsWith('WITH changed'))
        return Promise.resolve([{ approval_id: id }]);
      if (sql.includes('FROM hall_ticket_approvals'))
        return Promise.resolve([{ ...row }]);
      if (sql.includes('FROM exam_sessions'))
        return Promise.resolve([{ semester: 4, status: 'OPEN' }]);
      if (sql.includes('FROM exam_form_windows'))
        return Promise.resolve([{ window_id: windowId, semester: 4 }]);
      if (sql.includes('FROM exam_semester_registrations'))
        return Promise.resolve([reg]);
      if (sql.includes('FROM users'))
        return Promise.resolve([{ user_id: actor }]);
      throw new Error('Unexpected query');
    });
    const manager = { query };
    const db = {
      transaction: jest.fn(
        (work: (value: typeof manager) => Promise<unknown>) => work(manager),
      ),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new HallTicketDecisionService(
      db as unknown as DataSource,
      audit as never,
    );
    return { service, row, reg, manager, query, audit, db };
  }
  it('rejects with the required reason and same-manager audit, never advancing approval', async () => {
    const f = fixture();
    await expect(
      f.service.decide(tenant, actor, 'ExamAdmin', [id], {
        action: 'REJECT',
        reason: 'Missing official evidence',
      }),
    ).resolves.toEqual({ updated: 1, action: 'REJECT' });
    const write = f.query.mock.calls.find(([sql]) =>
      sql.startsWith('WITH changed'),
    );
    expect(write?.[0]).toContain('eligibility_status');
    expect(f.audit.log).toHaveBeenCalledWith(
      tenant,
      actor,
      expect.objectContaining({ action: 'HALL_TICKET_STAGE_REJECTED' }),
      f.manager,
    );
  });
  it.each([
    'ExamOperator',
    'ExamCell',
    'DeputyCOE',
    'Accountant',
    'SuperAdmin',
    undefined,
  ])('denies wrong Eligibility role %p', async (role) => {
    const f = fixture();
    await expect(
      f.service.decide(tenant, actor, role, [id], {
        action: 'REJECT',
        reason: 'Missing evidence',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.audit.log).not.toHaveBeenCalled();
    expect(
      f.query.mock.calls.some(([sql]) => sql.startsWith('WITH changed')),
    ).toBe(false);
  });
  it('keeps positive approval blocked even for the correct role', async () => {
    const f = fixture();
    await expect(
      f.service.decide(tenant, actor, 'ExamAdmin', [id], { action: 'APPROVE' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(
      f.query.mock.calls.some(([sql]) => sql.startsWith('WITH changed')),
    ).toBe(false);
  });
  it.each([
    { action: 'REJECT' },
    { action: 'APPROVE', stage: 'COE' },
    { action: 'REJECT', reason: ' ' },
  ])('rejects malformed commands %p before transactions', async (command) => {
    const f = fixture();
    await expect(
      f.service.decide(tenant, actor, 'ExamAdmin', [id], command),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.db.transaction).not.toHaveBeenCalled();
  });
  it.each(['PENDING', 'REJECTED'])('denies registration %s', async (status) => {
    const f = fixture();
    f.reg.status = status;
    await expect(
      f.service.decide(tenant, actor, 'ExamAdmin', [id], {
        action: 'REJECT',
        reason: 'Missing evidence',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rejects a different requested session and duplicate IDs', async () => {
    const f = fixture();
    await expect(
      f.service.decide(
        tenant,
        actor,
        'ExamAdmin',
        [id],
        { action: 'REJECT', reason: 'Missing evidence' },
        actor,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.service.decide(tenant, actor, 'ExamAdmin', [id, id], {
        action: 'REJECT',
        reason: 'Missing evidence',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('propagates required audit failure to the transaction', async () => {
    const f = fixture();
    f.audit.log.mockRejectedValue(new Error('audit failed'));
    await expect(
      f.service.decide(tenant, actor, 'ExamAdmin', [id], {
        action: 'REJECT',
        reason: 'Missing evidence',
      }),
    ).rejects.toThrow('audit failed');
  });
  it.each([
    ['ELIGIBILITY', 'ExamAdmin', 0],
    ['FINANCE', 'Accountant', 1],
    ['EXAM_OFFICE', 'DeputyCOE', 2],
    ['COE', 'ExamCell', 3],
  ] as const)(
    'uses the authorized %s officer for a sequential rejection',
    async (stage, role, index) => {
      const f = fixture();
      f.row.stage = stage;
      const columns = [
        'eligibility_status',
        'finance_status',
        'exam_office_status',
        'coe_status',
      ] as const;
      columns.slice(0, index).forEach((column) => {
        f.row[column] = 'APPROVED';
      });
      await expect(
        f.service.decide(tenant, actor, role, [id], {
          action: 'REJECT',
          reason: 'Official evidence incomplete',
        }),
      ).resolves.toMatchObject({ updated: 1 });
      expect(
        f.query.mock.calls.find(([sql]) => sql.startsWith('WITH changed'))?.[0],
      ).toContain(columns[index]);
    },
  );
  it('routes individual and bulk requests through the same decision service', async () => {
    const decisions = { decide: jest.fn().mockResolvedValue({ updated: 1 }) };
    const service = new ExamCellEnterpriseService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      decisions as never,
    );
    await service.advanceHallTicketApproval(
      tenant,
      id,
      actor,
      { action: 'APPROVE' },
      'ExamAdmin',
    );
    await service.bulkApproveHallTickets(
      tenant,
      actor,
      { session_id: session, approval_ids: [id] },
      'ExamAdmin',
    );
    expect(decisions.decide).toHaveBeenNthCalledWith(
      1,
      tenant,
      actor,
      'ExamAdmin',
      [id],
      { action: 'APPROVE' },
    );
    expect(decisions.decide).toHaveBeenNthCalledWith(
      2,
      tenant,
      actor,
      'ExamAdmin',
      [id],
      { action: 'APPROVE' },
      session,
    );
  });
});
