/* eslint-disable @typescript-eslint/no-unsafe-member-access -- focused query-boundary mocks */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { InvoiceIntegrityService } from './invoice-integrity.service';

const actor = {
  user_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: '20000000-0000-4000-8000-000000000001',
  role: 'APManager',
};

describe('Module 3 security boundaries', () => {
  it('returns not found before loading cross-scope child evidence', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { scope_type: 'DEPARTMENT', scope_reference: '9' },
      ])
      .mockResolvedValueOnce([]);
    const service = new InvoiceIntegrityService({
      query,
    } as unknown as DataSource);
    await expect(
      service.get(actor, '30000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(String(query.mock.calls[1][0])).toContain('c.tenant_id=$2');
    expect(String(query.mock.calls[1][0])).toContain('c.department_id=ANY');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects raw source secrets', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ scope_type: 'TENANT' }]);
    const service = new InvoiceIntegrityService({
      query,
    } as unknown as DataSource);
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
    const service = new InvoiceIntegrityService({
      query: jest.fn(),
    } as unknown as DataSource);
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
});
