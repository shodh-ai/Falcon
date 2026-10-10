import { StudentOnboardingService } from './student-onboarding.service';

describe('StudentOnboardingService staff verification queue', () => {
  it('includes HOD submissions in the global Super Admin queue', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          user_id: 'hod-user',
          name: 'GVMC HOD',
          official_email: 'hod.gvmc@mygyanvihar.com',
          onboarding_status: 'PENDING_ADMIN_APPROVAL',
          role_name: 'HOD',
          portal_kind: 'staff',
          submitted_at: new Date().toISOString(),
          doc_count: '4',
          tenant_subdomain: 'gvmc',
          tenant_name: 'Gyan Vihar Medical College',
        },
      ]),
    };
    const campusScope = {
      resolveCampusIds: jest.fn().mockResolvedValue(null),
    };
    const service = new StudentOnboardingService(
      dataSource as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      campusScope as never,
    );

    const rows = await service.getVerificationQueue('*', 'staff', {
      role: 'SuperAdmin',
      roles: ['SuperAdmin'],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      official_email: 'hod.gvmc@mygyanvihar.com',
      role_name: 'HOD',
      tenant_subdomain: 'gvmc',
      portal_kind: 'staff',
    });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('JOIN tenants t'),
      [],
    );
  });

  it('does not treat a tenant-scoped reviewer as a global queue caller', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const onboardingVerificationNotify = {
      syncPendingVerificationNotifications: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const service = new StudentOnboardingService(
      dataSource as never,
      {} as never,
      onboardingVerificationNotify as never,
      {} as never,
      {} as never,
      { resolveCampusIds: jest.fn().mockResolvedValue(null) } as never,
    );

    await service.getVerificationQueue('gvmc-tenant-id', 'staff', {
      role: 'CampusAdmin',
      roles: ['CampusAdmin'],
    });

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE u.tenant_id = $1'),
      ['gvmc-tenant-id'],
    );
  });
});
