import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { DataSource } from 'typeorm';
import type { AcquisitionService } from '../acquisitions/acquisition.service';
import type { InventoryService } from '../inventory/inventory.service';
import type { InventoryActor } from '../inventory/inventory.types';
import { ConsumablesService } from './consumables.service';

describe('Consumables request-boundary validation', () => {
  const actor = {
    user_id: randomUUID(),
    tenant_id: randomUUID(),
    role: 'Faculty',
    roles: ['Faculty'],
  } as InventoryActor;
  const service = new ConsumablesService(
    {} as DataSource,
    {} as InventoryService,
    {} as AcquisitionService,
  );

  it('returns a client error for a malformed issue ID before querying storage', async () => {
    await expect(
      service.custody(actor, 'not-a-uuid', 'qa-key', {
        issue_allocation_id: randomUUID(),
        action: 'RETURN',
        quantity: 1,
        reason: 'unused stock',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns a client error for a malformed issue-allocation ID', async () => {
    await expect(
      service.custody(actor, randomUUID(), 'qa-key', {
        issue_allocation_id: 'not-a-uuid',
        action: 'RETURN',
        quantity: 1,
        reason: 'unused stock',
      }),
    ).rejects.toThrow('Issue allocation ID must be a valid UUID');
  });
});
