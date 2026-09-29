import { OnboardingVerificationNotifyService } from './onboarding-verification-notify.service';

describe('OnboardingVerificationNotifyService', () => {
  it('routes staff verification only to Campus Admin and Super Admin', async () => {
    const dispatch = {
      dispatchToMany: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          { user_id: '10000000-0000-4000-8000-000000000001' },
          { user_id: '10000000-0000-4000-8000-000000000002' },
        ])
        .mockResolvedValueOnce([
          { user_id: '10000000-0000-4000-8000-000000000001' },
          { user_id: '10000000-0000-4000-8000-000000000002' },
        ]),
    };
    const service = new OnboardingVerificationNotifyService(
      dispatch as never,
      dataSource as never,
    );

    await service.notifyVerificationRequested({
      tenantId: 'a0000000-0000-4000-8000-000000000001',
      targetUserId: '20000000-0000-4000-8000-000000000001',
      submitterName: 'Riya',
      submitterEmail: 'riya.pharmacy@mygyanvihar.com',
      roleName: 'Faculty',
      portalKind: 'staff',
    });

    expect(dataSource.query.mock.calls[0][1][1]).toEqual([
      'CampusAdmin',
      'SuperAdmin',
    ]);
    expect(dispatch.dispatchToMany).toHaveBeenCalledWith(
      'a0000000-0000-4000-8000-000000000001',
      [
        '10000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002',
      ],
      expect.objectContaining({
        actionLink: '/admin/faculty-verifications',
      }),
      { queueDelivery: false },
    );
  });
});
