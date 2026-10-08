/* eslint-disable @typescript-eslint/no-unsafe-member-access -- focused query-boundary mocks */
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { InventoryService } from './inventory.service';
const actor = {
  user_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: '20000000-0000-4000-8000-000000000001',
  role: 'Stores',
};
describe('Module 5 query boundaries', () => {
  it('does not load cross-scope inventory details', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { scope_type: 'DEPARTMENT', scope_reference: '9' },
      ])
      .mockResolvedValueOnce([]);
    const service = new InventoryService(
      { query } as unknown as DataSource,
      { get: jest.fn() } as unknown as ConfigService,
    );
    await expect(
      service.get(actor, '30000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(String(query.mock.calls[1][0])).toContain('r.tenant_id=$2');
    expect(String(query.mock.calls[1][0])).toContain(
      'r.owner_department_id=ANY',
    );
  });
  it('public scan query does not select protected financial, custodian, location, or serial fields', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const service = new InventoryService(
      { query } as unknown as DataSource,
      { get: jest.fn() } as unknown as ConfigService,
    );
    await expect(
      service.publicScan('AST-FALCON-2026-000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).not.toContain('capitalized_cost');
    expect(sql).not.toContain('custodian_user_id');
    expect(sql).not.toContain('location_text');
    expect(sql).not.toContain('manufacturer_serial');
  });
});
