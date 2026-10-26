import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ExamCellService } from './exam-cell.service';

const tenant = '11111111-1111-4111-8111-111111111111';
const student = '22222222-2222-4222-8222-222222222222';

// These tests cover clearance boundaries only. They do not prove official
// issuance, strict session eligibility, database locking, or approval policy.
describe('hall-ticket clearance boundaries (mocked sources)', () => {
  function fixture() {
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]]>((sql) =>
      Promise.resolve(
        sql.includes('FROM users u')
          ? [{ user_id: student, name: 'Test student' }]
          : [{ c: 0 }],
      ),
    );
    const finance = { getPendingDues: jest.fn().mockResolvedValue([]) };
    const attendance = {
      evaluate: jest.fn().mockResolvedValue({
        eligible: true,
        attendance_percent: 85,
        threshold_source: 'DEFAULT',
        reason: null,
      }),
    };
    const pdf = { generate: jest.fn() };
    const notify = { admitCardLocked: jest.fn() };
    const service = new ExamCellService(
      { query } as never,
      finance as never,
      pdf as never,
      notify as never,
      {} as never,
      attendance as never,
      {} as never,
      {} as never,
    );
    return { service, query, finance, attendance, pdf, notify };
  }

  it.each([undefined, null, '', '   ', 'not-a-tenant', 42])(
    'rejects invalid tenant %p before any source or generation call',
    async (invalidTenant) => {
      const f = fixture();
      await expect(
        f.service.getAdmitBlockReasons(student, invalidTenant as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        f.service.auditAdmitCardsPreGeneration(invalidTenant as never, {
          batch_label: 'Test',
          semester: 4,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        f.service.generateAdmitCards(
          invalidTenant as never,
          { batch_label: 'Test', semester: 4 },
          student,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(f.query).not.toHaveBeenCalled();
      expect(f.finance.getPendingDues).not.toHaveBeenCalled();
      expect(f.attendance.evaluate).not.toHaveBeenCalled();
      expect(f.pdf.generate).not.toHaveBeenCalled();
      expect(f.notify.admitCardLocked).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed student identity before querying any clearance source', async () => {
    const f = fixture();
    await expect(
      f.service.getAdmitBlockReasons('invalid-student', tenant),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(f.query).not.toHaveBeenCalled();
    expect(f.finance.getPendingDues).not.toHaveBeenCalled();
  });

  it('requires the caller tenant for Finance, attendance, and hostel fines', async () => {
    const f = fixture();
    await expect(
      f.service.getAdmitBlockReasons(student, ` ${tenant} `),
    ).resolves.toEqual([]);
    expect(f.finance.getPendingDues).toHaveBeenCalledWith(student, tenant);
    expect(f.attendance.evaluate).toHaveBeenCalledWith(tenant, student, {
      context: 'ADMIT_CARD',
      audit: true,
    });
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      [student, tenant],
    );
  });

  it('retains the existing pending-fee and hostel-fine blockers', async () => {
    const f = fixture();
    f.finance.getPendingDues.mockResolvedValue([{ demand_id: 'test-demand' }]);
    f.query.mockResolvedValue([{ c: 1 }]);
    await expect(
      f.service.getAdmitBlockReasons(student, tenant),
    ).resolves.toEqual([
      'Blocked: Pending fee dues',
      'Blocked: Pending hostel fines',
    ]);
  });

  it('does not turn denied attendance without a reason into eligibility', async () => {
    const f = fixture();
    f.attendance.evaluate.mockResolvedValue({
      eligible: false,
      attendance_percent: 0,
      reason: null,
    });
    await expect(
      f.service.getAdmitBlockReasons(student, tenant),
    ).resolves.toEqual(['Blocked: Attendance clearance is not verified']);
  });

  it.each([
    null,
    undefined,
    {},
    { eligible: true },
    { eligible: 'true', attendance_percent: 80 },
    { eligible: true, attendance_percent: Number.NaN },
    { eligible: true, attendance_percent: -1 },
    { eligible: true, attendance_percent: 101 },
  ])('rejects malformed attendance response %p', async (response) => {
    const f = fixture();
    f.attendance.evaluate.mockResolvedValue(response);
    await expect(
      f.service.getAdmitBlockReasons(student, tenant),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(f.query).not.toHaveBeenCalled();
  });

  it.each([undefined, null, {}, { error: 'Finance unavailable' }])(
    'does not interpret invalid Finance response %p as clearance',
    async (response) => {
      const f = fixture();
      f.finance.getPendingDues.mockResolvedValue(response);
      await expect(
        f.service.getAdmitBlockReasons(student, tenant),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(f.attendance.evaluate).not.toHaveBeenCalled();
    },
  );

  it.each([
    { response: [] },
    { response: [{}] },
    { response: [{ c: -1 }] },
    { response: [{ c: Number.NaN }] },
  ])(
    'does not interpret invalid hostel clearance response %p as zero fines',
    async ({ response }) => {
      const f = fixture();
      f.query.mockResolvedValue(response);
      await expect(
        f.service.getAdmitBlockReasons(student, tenant),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    },
  );

  it('propagates unavailable Finance rather than reporting a clear audit', async () => {
    const f = fixture();
    f.finance.getPendingDues.mockRejectedValue(new Error('Finance offline'));
    await expect(
      f.service.auditAdmitCardsPreGeneration(tenant, {
        batch_label: 'Test',
        semester: 4,
      }),
    ).rejects.toThrow('Finance offline');
    expect(f.pdf.generate).not.toHaveBeenCalled();
    expect(f.notify.admitCardLocked).not.toHaveBeenCalled();
  });

  it('uses one clearance snapshot for audit display and reasons without an audit write', async () => {
    const f = fixture();
    f.attendance.evaluate.mockResolvedValue({
      eligible: false,
      attendance_percent: 10,
      reason: 'Attendance shortfall',
    });
    const result = await f.service.auditAdmitCardsPreGeneration(tenant, {
      batch_label: 'Test',
      semester: 4,
    });
    expect(result.blocked_count).toBe(1);
    expect(result.items[0]).toMatchObject({
      eligible: false,
      attendance_percent: 10,
      fee_status: 'Clear',
      block_reasons: ['Attendance shortfall'],
    });
    expect(f.finance.getPendingDues).toHaveBeenCalledTimes(1);
    expect(f.finance.getPendingDues).toHaveBeenCalledWith(student, tenant);
    expect(f.attendance.evaluate).toHaveBeenCalledTimes(1);
    expect(f.attendance.evaluate).toHaveBeenCalledWith(tenant, student, {
      context: 'ADMIT_CARD',
      audit: false,
    });
    expect(f.query.mock.calls.every(([sql]) => /^\s*SELECT\b/.test(sql))).toBe(
      true,
    );
  });
});
