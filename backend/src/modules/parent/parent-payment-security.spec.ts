import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ReadOnlyPortalGuard } from '../../common/guards/read-only-portal.guard';
import { ParentController } from './parent.controller';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ParentService } from './parent.service';
jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

function setup(linked = true) {
  const query = jest
    .fn()
    .mockResolvedValue(linked ? [{ tenant_id: 'child-tenant' }] : []);
  const payments = {
    createPaymentOrder: jest
      .fn()
      .mockResolvedValue({ order_id: 'order_verified', mock: false }),
    confirmVerifiedPayment: jest.fn().mockResolvedValue({
      success: true,
      transaction: { amount: 500 },
      receipt_url: '/uploads/verified.pdf',
    }),
  };
  const unused = {} as never;
  const service = new ParentService(
    { query } as never,
    unused,
    unused,
    unused,
    unused,
    payments as never,
  );
  return { service, query, payments };
}
describe('Parent verified payments', () => {
  it('creates checkout only through verified student fee service using the linked child tenant', async () => {
    const { service, payments, query } = setup();
    await expect(
      service.createPaymentOrder('parent-mobile', 'child', 'demand'),
    ).resolves.toEqual({ order_id: 'order_verified', mock: false });
    expect(payments.createPaymentOrder).toHaveBeenCalledWith(
      'child',
      'demand',
      'child-tenant',
    );
    const linkQuery = query.mock.calls[0] as [string, unknown[]];
    expect(linkQuery[0]).toContain('u.tenant_id = l.tenant_id');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('passes checkout identity and signature to server verification and uses its real receipt', async () => {
    const { service, payments, query } = setup();
    const result = await service.confirmPayment(
      'parent-mobile',
      'child',
      'demand',
      'pay_verified',
      { order_id: 'order_verified', signature: 'checkout-signature' },
    );
    expect(payments.confirmVerifiedPayment).toHaveBeenCalledWith(
      'child',
      'child-tenant',
      {
        demand_id: 'demand',
        payment_id: 'pay_verified',
        order_id: 'order_verified',
        signature: 'checkout-signature',
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        paid: true,
        receipt_url: '/uploads/verified.pdf',
      }),
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('never fabricates a payment id or turns verification failure into paid status', async () => {
    const { service, payments, query } = setup();
    await expect(
      service.confirmPayment('parent-mobile', 'child', 'demand'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(payments.confirmVerifiedPayment).not.toHaveBeenCalled();
    payments.confirmVerifiedPayment.mockRejectedValueOnce(
      new UnauthorizedException('Captured payment required'),
    );
    await expect(
      service.confirmPayment(
        'parent-mobile',
        'child',
        'demand',
        'fake-payment',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('rejects unrelated children before contacting any payment service', async () => {
    const { service, payments } = setup(false);
    await expect(
      service.createPaymentOrder('parent-mobile', 'foreign-child', 'demand'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.confirmPayment(
        'parent-mobile',
        'foreign-child',
        'demand',
        'pay_fake',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(payments.createPaymentOrder).not.toHaveBeenCalled();
    expect(payments.confirmVerifiedPayment).not.toHaveBeenCalled();
  });
  it('binds parent identity to the authenticated token and rejects another persona supplying a mobile', () => {
    const { service } = setup();
    expect(
      service.resolveMobile(
        { auth_type: 'parent', parent_mobile: 'token-mobile' },
        'forged-mobile',
      ),
    ).toBe('token-mobile');
    expect(() =>
      service.resolveMobile({ auth_type: 'student' }, 'forged-mobile'),
    ).toThrow(ForbiddenException);
  });
  it('projects only tenant-owned published canonical results and completed reassessment reports', async () => {
    const { service, query } = setup();
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('SELECT l.tenant_id')
          ? [{ tenant_id: 'child-tenant' }]
          : [],
      ),
    );
    jest.spyOn(service, 'getAttendance').mockResolvedValue([]);
    await service.getAcademicsSummary('parent-mobile', 'child');
    const sql = query.mock.calls.map(([value]: [string]) => value).join('\n');
    expect(sql).toContain('COALESCE(retake.marks_obtained, m.marks_obtained)');
    expect(sql).toContain('retake.source_exam_type = m.exam_type');
    expect(sql).toContain('retake.source_report_id = r.report_id');
    expect(sql).toContain('session.declared_at IS NOT NULL');
    expect(sql).toContain('r.tenant_id = $2');
    expect(sql).toContain("a.status = 'COMPLETED'");
    expect(sql).toContain('a.published_at IS NOT NULL');
  });
});

// Controller guards execute before route guards in Nest. Parent writes must authenticate first.
it('authenticates the parent before evaluating the read-only write exception', () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    ParentController,
  ) as unknown[];
  expect(guards).toEqual([JwtAuthGuard, ReadOnlyPortalGuard]);
});
