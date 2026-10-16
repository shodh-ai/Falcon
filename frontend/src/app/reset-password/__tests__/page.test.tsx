import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResetPasswordPage from '../page';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  token: 'test-token-that-must-not-render',
}));
const resetPasswordWithToken = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => ({ get: (key: string) => (key === 'token' ? navigation.token : null) }),
}));

vi.mock('@/lib/api', () => ({
  api: { resetPasswordWithToken },
}));

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.token = 'test-token-that-must-not-render';
    resetPasswordWithToken.mockReset();
    resetPasswordWithToken.mockResolvedValue({ success: true });
  });

  it('keeps the reset token internal and renders only password fields', () => {
    render(<ResetPasswordPage />);

    expect(screen.getAllByPlaceholderText(/password/i)).toHaveLength(2);
    expect(screen.queryByPlaceholderText(/reset token/i)).toBeNull();
    expect(screen.queryByDisplayValue(navigation.token)).toBeNull();
  });

  it('submits the internal token and redirects only after success', async () => {
    render(<ResetPasswordPage />);

    const fields = screen.getAllByPlaceholderText(/password/i);
    fireEvent.change(fields[0], { target: { value: 'NewPassword123!' } });
    fireEvent.change(fields[1], { target: { value: 'NewPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(resetPasswordWithToken).toHaveBeenCalledWith(
      navigation.token,
      'NewPassword123!',
    ));
    expect(navigation.push).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(navigation.push).toHaveBeenCalledWith('/');
  });

  it('does not submit or redirect when the token is missing', () => {
    navigation.token = '';
    render(<ResetPasswordPage />);

    expect(screen.getByText(/missing or invalid/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /update password/i })).toHaveProperty('disabled', true);
    expect(resetPasswordWithToken).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
