import { BadRequestException, ConflictException } from '@nestjs/common';
import { StudentOnboardingService } from './student-onboarding.service';

describe('StudentOnboardingService.submitForVerification', () => {
  const tenantId = 'tenant-1';
  const userId = 'faculty-1';
  const user = (status = 'PENDING_DOCUMENTS') => ({
    onboarding_status: status,
    role_name: 'Faculty',
    name: 'Test Faculty',
    official_email: 'faculty@example.test',
  });

  function setup() {
    const query = jest.fn();
    const getUserRow = jest.fn().mockResolvedValue(user());
    const getStep2Profile = jest.fn().mockResolvedValue({});
    const validateProfileComplete = jest.fn();
    const listDocs = jest.fn().mockResolvedValue(
      ['AADHAAR', 'PAN', 'HIGHEST_DEGREE', 'PHOTO'].map(doc_type => ({ doc_type, file_path: '/test-document' })),
    );
    const onboardingVerificationRequested = jest.fn();
    const service = Object.assign(Object.create(StudentOnboardingService.prototype), {
      dataSource: { query }, getUserRow, getStep2Profile, validateProfileComplete, listDocs,
      notifications: { onboardingVerificationRequested },
    }) as StudentOnboardingService;
    const submit = () => service.submitForVerification(tenantId, userId);
    return { service, query, getUserRow, getStep2Profile, listDocs, onboardingVerificationRequested, submit };
  }

  it.each([
    { returned: [[{ user_id: userId }], 1] },
    { returned: [{ user_id: userId }] },
  ])('notifies once only after an actual saved submission ($returned)', async ({ returned }) => {
    const { query, onboardingVerificationRequested, submit } = setup();
    query.mockResolvedValue(returned);
    await expect(submit()).resolves.toEqual({ onboarding_status: 'PENDING_ADMIN_APPROVAL' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("onboarding_status IN ('PENDING_DOCUMENTS', 'IN_PROGRESS')"), [userId, tenantId]);
    expect(onboardingVerificationRequested).toHaveBeenCalledTimes(1);
    expect(onboardingVerificationRequested).toHaveBeenCalledWith(expect.objectContaining({ tenantId, targetUserId: userId, portalKind: 'staff' }));
  });

  it.each(['PENDING_ADMIN_APPROVAL', 'COMPLETED', 'ACTIVE'])(
    'returns the authoritative %s stage after another request advances without notifying again', async status => {
      const { query, getUserRow, onboardingVerificationRequested, submit } = setup();
      getUserRow.mockResolvedValueOnce(user()).mockResolvedValueOnce(user(status));
      query.mockResolvedValue([[], 0]);
      await expect(submit()).resolves.toEqual({ onboarding_status: status });
      expect(getUserRow).toHaveBeenCalledTimes(2);
      expect(onboardingVerificationRequested).not.toHaveBeenCalled();
    },
  );

  it.each(['PENDING_DOCUMENTS', 'IN_PROGRESS', 'PENDING_PASSWORD_RESET'])(
    'does not claim a successful submission for an empty UPDATE tuple while current state is %s', async status => {
      const { query, getUserRow, onboardingVerificationRequested, submit } = setup();
      getUserRow.mockResolvedValueOnce(user()).mockResolvedValueOnce(user(status));
      query.mockResolvedValue([[], 0]);
      await expect(submit()).rejects.toBeInstanceOf(ConflictException);
      expect(onboardingVerificationRequested).not.toHaveBeenCalled();
    },
  );

  it('handles simultaneous retries with one transition and one verification notification', async () => {
    const { query, getUserRow, onboardingVerificationRequested, submit } = setup();
    getUserRow.mockResolvedValueOnce(user()).mockResolvedValueOnce(user()).mockResolvedValue(user('PENDING_ADMIN_APPROVAL'));
    query.mockResolvedValueOnce([[{ user_id: userId }], 1]).mockResolvedValueOnce([[], 0]);
    const results = await Promise.all([submit(), submit()]);
    expect(results).toEqual([{ onboarding_status: 'PENDING_ADMIN_APPROVAL' }, { onboarding_status: 'PENDING_ADMIN_APPROVAL' }]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(onboardingVerificationRequested).toHaveBeenCalledTimes(1);
  });

  it.each(['PENDING_ADMIN_APPROVAL', 'COMPLETED', 'ACTIVE'])(
    'retries the already completed %s stage without reading documents or writing', async status => {
      const { query, getUserRow, getStep2Profile, listDocs, onboardingVerificationRequested, submit } = setup();
      getUserRow.mockResolvedValue(user(status));
      await expect(submit()).resolves.toEqual({ onboarding_status: status });
      expect(query).not.toHaveBeenCalled();
      expect(getStep2Profile).not.toHaveBeenCalled();
      expect(listDocs).not.toHaveBeenCalled();
      expect(onboardingVerificationRequested).not.toHaveBeenCalled();
    },
  );

  it('keeps required-document checks before the state transition', async () => {
    const { query, listDocs, onboardingVerificationRequested, submit } = setup();
    listDocs.mockResolvedValue([{ doc_type: 'PHOTO', file_path: '/test-document' }]);
    await expect(submit()).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    expect(onboardingVerificationRequested).not.toHaveBeenCalled();
  });
});
