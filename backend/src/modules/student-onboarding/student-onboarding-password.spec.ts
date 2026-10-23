import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { StudentOnboardingService } from './student-onboarding.service';

jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

describe('StudentOnboardingService.resetPassword', () => {
  const query = jest.fn();
  const compare = bcrypt.compare as jest.Mock;
  const hash = bcrypt.hash as jest.Mock;
  let service: StudentOnboardingService;

  beforeEach(() => {
    jest.resetAllMocks();
    compare.mockResolvedValue(true);
    hash.mockResolvedValue('new-hash');
    service = new StudentOnboardingService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  const reset = () =>
    service.resetPassword('tenant-1', 'user-1', 'old-password', 'new-password');

  it.each([
    null,
    '',
    '   ',
    'PENDING_ONBOARDING',
    'PENDING_PASSWORD_RESET',
    ' pending_onboarding ',
  ])(
    'verifies and saves the password for legacy or pending status %p',
    async (status) => {
      query.mockResolvedValueOnce([
        { password_hash: 'old-hash', onboarding_status: status },
      ]);
      query.mockResolvedValueOnce([{ onboarding_status: 'PENDING_DOCUMENTS' }]);

      await expect(reset()).resolves.toEqual({
        onboarding_status: 'PENDING_DOCUMENTS',
        password_changed: true,
      });
      expect(compare).toHaveBeenCalledWith('old-password', 'old-hash');
      expect(query.mock.calls[1][1]).toEqual([
        'new-hash',
        'user-1',
        'tenant-1',
        'old-hash',
      ]);
      expect(query.mock.calls[1][0]).toContain(
        "COALESCE(UPPER(BTRIM(onboarding_status)), '')",
      );
    },
  );

  it('rejects an incorrect current password for an unset legacy status without writing', async () => {
    query.mockResolvedValueOnce([
      { password_hash: 'old-hash', onboarding_status: null },
    ]);
    compare.mockResolvedValueOnce(false);
    await expect(reset()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(hash).not.toHaveBeenCalled();
  });

  it('allows a retry after completion without changing the password again', async () => {
    query.mockResolvedValueOnce([
      { password_hash: 'new-hash', onboarding_status: 'PENDING_DOCUMENTS' },
    ]);
    await expect(reset()).resolves.toEqual({
      onboarding_status: 'PENDING_DOCUMENTS',
      password_changed: false,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(hash).not.toHaveBeenCalled();
  });

  it('returns the authoritative stage if another request advances onboarding before the update', async () => {
    query.mockResolvedValueOnce([
      { password_hash: 'old-hash', onboarding_status: null },
    ]);
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([
      { onboarding_status: 'PENDING_ADMIN_APPROVAL' },
    ]);
    await expect(reset()).resolves.toEqual({
      onboarding_status: 'PENDING_ADMIN_APPROVAL',
      password_changed: false,
    });
  });

  it('does not report success if a concurrent password change prevents the update', async () => {
    query.mockResolvedValueOnce([
      { password_hash: 'old-hash', onboarding_status: null },
    ]);
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([{ onboarding_status: null }]);
    await expect(reset()).rejects.toBeInstanceOf(ConflictException);
  });
});
