import { ForbiddenException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { CacheService } from '../../core/redis/cache.service';
import { HrAccessControlService } from './hr-access-control.service';

describe('HrAccessControlService workflow ROLE stage', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const actorId = '20000000-0000-4000-8000-000000000001';

  function createService(query: jest.Mock) {
    return new HrAccessControlService(
      { query } as unknown as DataSource,
      {} as CacheService,
    );
  }

  it('requires the assigned role to still belong to the actor in the same tenant', async () => {
    const query = jest.fn().mockResolvedValue([{ role_name: 'HR' }]);
    const service = createService(query);

    await expect(
      service.assertWorkflowApproverPower(
        tenantId,
        actorId,
        [],
        'ROLE',
        'LEAVE',
        'HR',
      ),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      tenantId,
      actorId,
      'HR',
    ]);
  });

  it('rejects a removed role even when the actor has an administrative role', async () => {
    const service = createService(jest.fn().mockResolvedValue([]));

    await expect(
      service.assertWorkflowApproverPower(
        tenantId,
        actorId,
        ['HRAdmin'],
        'ROLE',
        'LEAVE',
        'HR',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
