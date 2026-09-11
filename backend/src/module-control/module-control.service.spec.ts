import { ModuleControlService } from './module-control.service';

describe('ModuleControlService effective state', () => {
  function service(rows: unknown[]) {
    return new ModuleControlService({
      query: jest.fn().mockResolvedValue(rows),
    } as any);
  }

  it('defaults uncatalogued tenant state to OFF', async () => {
    await expect(
      service([]).effectiveState('finance_procurement', {
        tenantId: 'tenant-a',
      }),
    ).resolves.toMatchObject({ state: 'OFF', available: false });
  });

  it('allows pilot only for a matching cohort row', async () => {
    const tenantPilot = await service([
      { state: 'PILOT', scope_type: 'TENANT', scope_id: null, revision: 2 },
    ]).effectiveState('finance_procurement', { tenantId: 'tenant-a' });
    const departmentPilot = await service([
      { state: 'PILOT', scope_type: 'DEPARTMENT', scope_id: '4', revision: 3 },
    ]).effectiveState('finance_procurement', {
      tenantId: 'tenant-a',
      departmentId: 4,
    });
    expect(tenantPilot.available).toBe(false);
    expect(departmentPilot.available).toBe(true);
  });

  it('gives a global pause precedence over lower scopes', async () => {
    const result = await service([
      { state: 'PAUSED', scope_type: 'GLOBAL', scope_id: null, revision: 5 },
      { state: 'ACTIVE', scope_type: 'DEPARTMENT', scope_id: '4', revision: 8 },
    ]).effectiveState('finance_procurement', {
      tenantId: 'tenant-a',
      departmentId: 4,
    });
    expect(result).toMatchObject({
      state: 'PAUSED',
      available: false,
      sourceScope: 'GLOBAL',
    });
  });

  it('keeps existing deployments active while the expand migration rolls out', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue({ code: '42P01' }),
    };
    await expect(
      new ModuleControlService(dataSource as any).effectiveState(
        'finance_procurement',
        { tenantId: 'tenant-a' },
      ),
    ).resolves.toMatchObject({
      state: 'ACTIVE',
      available: true,
      sourceScope: 'MIGRATION_FALLBACK',
    });
  });
});
