/* eslint-disable @typescript-eslint/no-unsafe-member-access -- focused query-boundary mocks */
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { ProductVerificationService } from './product-verification.service';

const actor = {
  user_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: '20000000-0000-4000-8000-000000000001',
  role: 'Stores',
};

describe('Module 4 query boundaries', () => {
  it('returns not found before loading cross-scope subject evidence', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { scope_type: 'DEPARTMENT', scope_reference: '9' },
      ])
      .mockResolvedValueOnce([]);
    const service = new ProductVerificationService(
      { query } as unknown as DataSource,
      { get: jest.fn() } as unknown as ConfigService,
    );
    await expect(
      service.get(actor, '30000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(String(query.mock.calls[1][0])).toContain('c.tenant_id=$2');
    expect(String(query.mock.calls[1][0])).toContain('c.department_id=ANY');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('public lookup returns only safe identity fields', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        verification_code: 'PV-ABCDEFGHIJKL',
        status: 'REVOKED',
        subject_type: 'ITEM',
        subject_quantity: '1',
        unit_of_measure: 'unit',
        product_name: 'Laptop',
        category: 'IT',
        final_decision: 'CLEARED_HUMAN',
        trust_level: 'HUMAN_VERIFIED',
        verification_revision: '2',
        verification_record_hash: 'a'.repeat(64),
        signature_algorithm: 'Ed25519',
        signing_key_version: 'v1',
        signature: 'signed',
        issued_at: new Date(),
        revoked_at: new Date(),
      },
    ]);
    const service = new ProductVerificationService(
      { query } as unknown as DataSource,
      { get: jest.fn() } as unknown as ConfigService,
    );
    const result = await service.verifyCode('PV-ABCDEFGHIJKL');
    expect(result).toMatchObject({
      status: 'REVOKED',
      current_validity: 'NOT_VALID',
    });
    expect(result).not.toHaveProperty('tenant_id');
    expect(result).not.toHaveProperty('object_key');
    expect(result).not.toHaveProperty('latitude');
  });
});
