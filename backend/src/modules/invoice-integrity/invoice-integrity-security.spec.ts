/* eslint-disable @typescript-eslint/no-unsafe-member-access -- focused query-boundary mocks */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { InvoiceIntegrityService } from './invoice-integrity.service';

const notifications = { dispatch: jest.fn() };

const actor = {
  user_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: '20000000-0000-4000-8000-000000000001',
  role: 'APManager',
};

describe('Module 3 security boundaries', () => {
  beforeEach(() => notifications.dispatch.mockReset());

  it('returns not found before loading cross-scope child evidence', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { scope_type: 'DEPARTMENT', scope_reference: '9' },
      ])
      .mockResolvedValueOnce([]);
    const service = new InvoiceIntegrityService(
      { query } as unknown as DataSource,
      notifications as never,
    );
    await expect(
      service.get(actor, '30000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(String(query.mock.calls[1][0])).toContain('c.tenant_id=$2');
    expect(String(query.mock.calls[1][0])).toContain('c.department_id=ANY');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects raw source secrets', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ scope_type: 'TENANT' }]);
    const service = new InvoiceIntegrityService(
      { query } as unknown as DataSource,
      notifications as never,
    );
    await expect(
      service.createSourceAccount(actor, {
        platform: 'Example',
        account_label: 'Finance',
        external_account_reference: 'department-account',
        secret_reference: 'plain-password',
        allowed_domains: ['example.com'],
      }),
    ).rejects.toThrow('Only an encrypted secret reference');
  });

  it('requires recent step-up for human certification', async () => {
    const service = new InvoiceIntegrityService(
      { query: jest.fn() } as unknown as DataSource,
      notifications as never,
    );
    await expect(
      service.certifyHuman(
        actor,
        '30000000-0000-4000-8000-000000000001',
        1,
        {
          investigation_id: '40000000-0000-4000-8000-000000000001',
          decision: 'CLEARED_HUMAN',
          decision_reason: 'Reviewed',
        },
        'key',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('delivers production step-up codes to the authenticated in-app inbox', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ scope_type: 'TENANT' }])
      .mockResolvedValueOnce([
        {
          integrity_case_id: '30000000-0000-4000-8000-000000000001',
          tenant_id: actor.tenant_id,
        },
      ])
      .mockResolvedValueOnce([
        {
          challenge_id: '50000000-0000-4000-8000-000000000001',
          expires_at: expiresAt,
        },
      ])
      .mockResolvedValueOnce([]);
    notifications.dispatch.mockResolvedValueOnce({});
    const service = new InvoiceIntegrityService(
      { query } as unknown as DataSource,
      notifications as never,
    );
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDevOtp = process.env.INVOICE_INTEGRITY_DEV_OTP;
    delete process.env.NODE_ENV;
    delete process.env.INVOICE_INTEGRITY_DEV_OTP;
    try {
      const result = await service.requestStepUp(
        actor,
        '30000000-0000-4000-8000-000000000001',
        'CERTIFICATION',
      );
      expect(result).toMatchObject({
        delivery_status: 'IN_APP_DELIVERED',
        purpose: 'CERTIFICATION',
      });
      expect(result).not.toHaveProperty('dev_otp');
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: actor.user_id,
          category: 'FINANCE',
          queueDelivery: false,
          metadata: expect.objectContaining({
            type: 'INVOICE_INTEGRITY_STEP_UP',
            integrity_case_id:
              '30000000-0000-4000-8000-000000000001',
          }),
        }),
      );
      expect(String(query.mock.calls[3][0])).toContain(
        'challenge.locked_at IS NOT NULL',
      );
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousDevOtp === undefined)
        delete process.env.INVOICE_INTEGRITY_DEV_OTP;
      else process.env.INVOICE_INTEGRITY_DEV_OTP = previousDevOtp;
    }
  });
});
