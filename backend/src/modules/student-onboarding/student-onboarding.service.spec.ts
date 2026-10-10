import * as bcrypt from 'bcrypt';
import { StudentOnboardingService } from './student-onboarding.service';

describe('StudentOnboardingService first-login password reset', () => {
  const makeService = (query: jest.Mock) =>
    new StudentOnboardingService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

  it('moves a newly imported student from password reset to profile setup', async () => {
    const query = jest.fn();
    query.mockResolvedValueOnce([
      {
        password_hash: await bcrypt.hash('Temporary-123!', 4),
        onboarding_status: 'PENDING_PASSWORD_RESET',
        account_status: 'PASSWORD_RESET_REQUIRED',
      },
    ]);
    query.mockResolvedValueOnce([]);

    const result = await makeService(query).resetPassword(
      'tenant-1',
      'student-1',
      'Temporary-123!',
      'Student-New-123!',
    );

    expect(result).toEqual({ onboarding_status: 'PENDING_DOCUMENTS' });
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('onboarding_status = $4'),
      expect.arrayContaining(['student-1', 'tenant-1', 'PENDING_DOCUMENTS', true]),
    );
  });

  it('preserves a completed account when an administrator issues a reset', async () => {
    const query = jest.fn();
    query.mockResolvedValueOnce([
      {
        password_hash: await bcrypt.hash('Existing-123!', 4),
        onboarding_status: 'COMPLETED',
        account_status: 'PASSWORD_RESET_REQUIRED',
      },
    ]);
    query.mockResolvedValueOnce([]);

    const result = await makeService(query).resetPassword(
      'tenant-1',
      'faculty-1',
      'Existing-123!',
      'Faculty-New-123!',
    );

    expect(result).toEqual({ onboarding_status: 'COMPLETED' });
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('onboarding_status = $4'),
      expect.arrayContaining(['faculty-1', 'tenant-1', 'COMPLETED', true]),
    );
  });
});
