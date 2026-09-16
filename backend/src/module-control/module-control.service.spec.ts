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

describe('ModuleControlService LMS launch readiness', () => {
  it('requires live data plus migration, storage, smoke and security evidence', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ tables_ready: true }])
      .mockResolvedValueOnce([
        {
          course_count: 10,
          programme_count: 1,
          faculty_allocation_count: 4,
          enrollment_count: 80,
        },
      ])
      .mockResolvedValueOnce([
        { check_key: 'DATA_MIGRATION', status: 'PASS' },
        { check_key: 'STORAGE_HEALTH', status: 'PASS' },
        { check_key: 'LMS_SMOKE', status: 'PASS' },
        { check_key: 'SECURITY_ACCEPTANCE', status: 'PASS' },
      ]);
    const result = await (
      new ModuleControlService({ query } as any) as any
    ).lmsReadiness({ tenantId: 'tenant-a', departmentId: 7 });
    expect(result.ready).toBe(true);
    expect(query.mock.calls[2][1]).toEqual(['tenant-a', 'DEPARTMENT', '7']);
  });

  it('fails closed when acceptance evidence is absent', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ tables_ready: true }])
      .mockResolvedValueOnce([
        {
          course_count: 10,
          programme_count: 1,
          faculty_allocation_count: 4,
          enrollment_count: 80,
        },
      ])
      .mockResolvedValueOnce([]);
    const result = await (
      new ModuleControlService({ query } as any) as any
    ).lmsReadiness({ tenantId: 'tenant-a', departmentId: 7 });
    expect(result.ready).toBe(false);
    expect(result.checks).toMatchObject({
      providerMigrationAccepted: false,
      storageVerified: false,
      smokeTestsPassed: false,
      securityTestsPassed: false,
    });
  });
});
