import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSettingsPage } from '../AccountSettingsPage';

const state = vi.hoisted(() => ({
  api: { post: vi.fn() }, user: { user_id: 'faculty-one', tenant_id: 'tenant-one', name: 'First Faculty', email: 'first@example.test', role: 'Faculty' },
  refreshUser: vi.fn(), logout: vi.fn(), toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => state.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: state.user, refreshUser: state.refreshUser, logout: state.logout, isLoading: false }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/faculty/settings' }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: state.toast }));
vi.mock('@/components/settings/FacultyDetailsSettingsSection', () => ({ FacultyDetailsSettingsSection: () => null }));
vi.mock('@/lib/auth-routing', () => ({ getProfileHrefFromPath: () => '/faculty/me', getWorkspaceLabelForRole: () => 'Faculty', getActiveWorkspaceRoleFromPath: () => 'Faculty' }));

beforeEach(() => {
  vi.clearAllMocks();
  state.api = { post: vi.fn().mockResolvedValue({}) };
  state.user = { user_id: 'faculty-one', tenant_id: 'tenant-one', name: 'First Faculty', email: 'first@example.test', role: 'Faculty' };
  state.refreshUser.mockResolvedValue(state.user);
});
afterEach(cleanup);
function fillPasswords() {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'SyntheticOld!123' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'SyntheticNew!456' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'SyntheticNew!456' } });
}

describe('settings password lifecycle', () => {
  it('sends one same-tick request and locks password editors and visibility toggles', async () => {
    let resolve!: (value: unknown) => void;
    state.api.post.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<AccountSettingsPage hidePageHeader />);
    fillPasswords();
    const submit = screen.getByRole('button', { name: 'Update password' });
    act(() => { fireEvent.click(submit); fireEvent.click(submit); });
    expect(state.api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Current password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show current password' })).toBeDisabled();
    await act(async () => resolve({}));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled());
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });

  it('preserves a failed password draft and never refreshes the account', async () => {
    state.api.post.mockRejectedValueOnce(new Error('Current password is incorrect'));
    render(<AccountSettingsPage hidePageHeader />);
    fillPasswords();
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect');
    expect(screen.getByLabelText('Current password')).toHaveValue('SyntheticOld!123');
    expect(screen.getByLabelText('New password')).toHaveValue('SyntheticNew!456');
    expect(state.refreshUser).not.toHaveBeenCalled();
  });

  it.each(['reject', 'null'])('keeps a confirmed password change successful when account refresh returns %s', async mode => {
    if (mode === 'reject') state.refreshUser.mockRejectedValueOnce(new Error('Account refresh unavailable'));
    else state.refreshUser.mockResolvedValueOnce(null);
    render(<AccountSettingsPage hidePageHeader />);
    fillPasswords();
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Your password was updated, but account details could not be refreshed');
    expect(state.toast.success).toHaveBeenCalledWith('Password updated successfully');
    expect(state.toast.error).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('clears secrets on account change and ignores an old password completion before refreshUser', async () => {
    let resolveOld!: (value: unknown) => void;
    state.api.post.mockReturnValue(new Promise(done => { resolveOld = done; }));
    const view = render(<AccountSettingsPage hidePageHeader />);
    fillPasswords();
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    state.user = { ...state.user, user_id: 'faculty-two', tenant_id: 'tenant-two', name: 'Second Faculty' };
    state.api = { post: vi.fn() };
    view.rerender(<AccountSettingsPage hidePageHeader />);
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'NewAccountDraft!123' } });
    await act(async () => resolveOld({}));
    expect(state.refreshUser).not.toHaveBeenCalled();
    expect(state.toast.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Current password')).toHaveValue('NewAccountDraft!123');
    expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled();
  });
});
