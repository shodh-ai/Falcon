import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

describe('AuthService.resetPasswordWithToken', () => {
  const query = jest.fn();
  const hash = bcrypt.hash as jest.Mock;
  let service: AuthService;
  const validToken = {
    token_id: 'reset-1',
    user_id: 'faculty-1',
    tenant_id: 'tenant-1',
    role_name: 'Faculty',
    onboarding_status: 'PENDING_ADMIN_APPROVAL' as string | null,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    hash.mockResolvedValue('replacement-password-hash');
    service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { query } as never,
      {} as never,
    );
  });

  const reset = () =>
    service.resetPasswordWithToken('valid-token', 'new-password');

  it.each([
    'PENDING_ADMIN_APPROVAL',
    'PENDING_DOCUMENTS',
    'IN_PROGRESS',
    'COMPLETED',
    'ACTIVE',
  ])('preserves %s while recovering the password', async (status) => {
    query.mockResolvedValueOnce([{ ...validToken, onboarding_status: status }]);
    query.mockResolvedValue([]);

    await expect(reset()).resolves.toEqual({ success: true });
    expect(query.mock.calls[1][1]).toEqual([
      'replacement-password-hash',
      'faculty-1',
      'tenant-1',
      status,
      status,
    ]);
    expect(query.mock.calls[2][1]).toEqual(['reset-1']);
  });

  it.each([
    ['Faculty', null],
    ['Faculty', '   '],
    ['Faculty', 'PENDING_ONBOARDING'],
    ['Faculty', 'PENDING_PASSWORD_RESET'],
    ['HOD', 'PENDING_PASSWORD_RESET'],
    ['Dean', null],
    ['Student', null],
    ['Student', 'PENDING_PASSWORD_RESET'],
    ['Applicant', 'PENDING_ONBOARDING'],
  ])(
    'advances %s from %p to profile setup after a valid password recovery',
    async (role, status) => {
      query.mockResolvedValueOnce([
        { ...validToken, role_name: role, onboarding_status: status },
      ]);
      query.mockResolvedValue([]);
      await reset();
      expect(hash).toHaveBeenCalledWith('new-password', 10);
      expect(query.mock.calls[1][1]).toEqual([
        'replacement-password-hash',
        'faculty-1',
        'tenant-1',
        status,
        'PENDING_DOCUMENTS',
      ]);
      // Preserve a newer approval/profile state if it changes while bcrypt runs.
      expect(query.mock.calls[1][0]).toContain(
        'WHEN onboarding_status IS NOT DISTINCT FROM $4 THEN $5',
      );
      expect(query.mock.calls[1][0]).toContain('ELSE onboarding_status');
    },
  );

  it.each([null, 'PENDING_ONBOARDING', 'PENDING_PASSWORD_RESET'])(
    'retains password-only completion for CampusAdmin in state %p',
    async (status) => {
      query.mockResolvedValueOnce([
        { ...validToken, role_name: 'CampusAdmin', onboarding_status: status },
      ]);
      query.mockResolvedValue([]);
      await reset();
      expect(query.mock.calls[1][1][4]).toBe('COMPLETED');
    },
  );

  it('does not write credentials or consume a token when it is invalid or expired', async () => {
    query.mockResolvedValueOnce([]);
    await expect(reset()).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([
      createHash('sha256').update('valid-token').digest('hex'),
    ]);
    expect(query.mock.calls[0][0]).toContain(
      't.used_at IS NULL AND t.expires_at > NOW()',
    );
    expect(hash).not.toHaveBeenCalled();
  });

  it('does not consume the token if saving the password fails', async () => {
    query.mockResolvedValueOnce([validToken]);
    query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(reset()).rejects.toThrow('database unavailable');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects a short password before any database access', async () => {
    await expect(
      service.resetPasswordWithToken('valid-token', 'short'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});
