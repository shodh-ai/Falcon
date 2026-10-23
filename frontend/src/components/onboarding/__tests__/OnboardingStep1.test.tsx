import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingStep1 } from '../OnboardingStep1';
import { FACULTY_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

const mocks = vi.hoisted(() => ({
  post: vi.fn(), get: vi.fn(), replace: vi.fn(), update: vi.fn(),
  success: vi.fn(), error: vi.fn(),
  account: { token: 'token-1', user: { user_id: 'faculty-1' } },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ ...mocks.account, updateOnboardingStatus: mocks.update }) }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => ({ post: mocks.post, get: mocks.get }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));

function submit() {
  const view = render(<OnboardingStep1 config={FACULTY_ONBOARDING_CONFIG} />);
  fireEvent.change(screen.getByLabelText(/Current password/), { target: { value: 'Old-test-password1' } });
  fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'New-test-password2' } });
  fireEvent.change(screen.getByLabelText(/Confirm new password/), { target: { value: 'New-test-password2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  return view;
}

describe('password setup navigation', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.account = { token: 'token-1', user: { user_id: 'faculty-1' } }; });
  afterEach(cleanup);

  it('ignores a password reset that completes after an account switch and clears the old credentials', async () => {
    let resolve!: (value: unknown) => void;
    mocks.post.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const view = submit();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    mocks.account = { token: 'token-2', user: { user_id: 'faculty-2' } };
    view.rerender(<OnboardingStep1 config={FACULTY_ONBOARDING_CONFIG} />);
    expect(screen.getByLabelText(/Current password/)).toHaveValue('');
    await act(async () => { resolve({ onboarding_status: 'PENDING_DOCUMENTS', password_changed: true }); });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('does not route when authentication refuses an outdated status update', async () => {
    mocks.update.mockReturnValueOnce(false);
    mocks.post.mockResolvedValue({ onboarding_status: 'PENDING_DOCUMENTS', password_changed: true });
    submit();
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each([null, 'PENDING_PASSWORD_RESET', 'PENDING_ONBOARDING', 'UNKNOWN'])('rejects a successful HTTP response that has not advanced onboarding (%s)', async (status) => {
    mocks.post.mockResolvedValue({ onboarding_status: status, password_changed: false });
    submit();
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('updates the session and opens profile setup after a completed reset', async () => {
    mocks.post.mockResolvedValue({ onboarding_status: 'PENDING_DOCUMENTS', password_changed: true });
    submit();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/faculty/onboarding/step-2'));
    expect(mocks.update).toHaveBeenCalledWith('PENDING_DOCUMENTS');
    expect(mocks.success).toHaveBeenCalledWith('Password updated. Continue to profile setup.');
  });

  it('continues an already completed reset without claiming another password change', async () => {
    mocks.post.mockResolvedValue({ onboarding_status: 'PENDING_DOCUMENTS', password_changed: false });
    submit();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/faculty/onboarding/step-2'));
    expect(mocks.success).toHaveBeenCalledWith('Password setup is already complete. Continuing onboarding.');
  });
});
