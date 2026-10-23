import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FacultyDetailsSettingsSection } from '../FacultyDetailsSettingsSection';

const state = vi.hoisted(() => ({ api: { get: vi.fn(), patch: vi.fn() },
  user: { user_id: 'faculty-one', tenant_id: 'tenant-one' }, refreshUser: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => state.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: state.user, refreshUser: state.refreshUser }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: state.toast }));
const profile = { name: 'First Faculty', email: 'first@example.test', phone: '1234567890', designation: 'Lecturer', department: 'Computing', employee_id: null,
  personal: { emergency_contact_name: 'Contact One', emergency_contact_phone: '9999999999', permanent_address: 'Address one', current_address: 'Address two' } };
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { user_id: 'faculty-one', tenant_id: 'tenant-one' };
  state.api = { get: vi.fn().mockResolvedValue(profile), patch: vi.fn().mockResolvedValue(profile) };
  state.refreshUser.mockResolvedValue(state.user);
});
afterEach(cleanup);

describe('settings contact details lifecycle', () => {
  it('shows a persistent read error and Retry without exposing an editable blank profile', async () => {
    state.api.get.mockRejectedValueOnce(new Error('Details unavailable'));
    render(<FacultyDetailsSettingsSection profileHref="/faculty/me" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Details unavailable');
    expect(screen.queryByPlaceholderText('10-digit mobile number')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByPlaceholderText('10-digit mobile number')).toHaveValue('1234567890');
  });

  it('guards duplicate saves and locks all contact fields until completion', async () => {
    let resolve!: (value: unknown) => void;
    state.api.patch.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<FacultyDetailsSettingsSection profileHref="/faculty/me" />);
    await screen.findByPlaceholderText('10-digit mobile number');
    const save = screen.getByRole('button', { name: 'Save profile details' });
    act(() => { fireEvent.click(save); fireEvent.click(save); });
    expect(state.api.patch).toHaveBeenCalledTimes(1);
    screen.getAllByRole('textbox').forEach(field => expect(field).toBeDisabled());
    await act(async () => resolve(profile));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save profile details' })).toBeEnabled());
  });

  it('preserves contact drafts on a failed save', async () => {
    state.api.patch.mockRejectedValueOnce(new Error('Contact save unavailable'));
    render(<FacultyDetailsSettingsSection profileHref="/faculty/me" />);
    fireEvent.change(await screen.findByPlaceholderText('10-digit mobile number'), { target: { value: '7777777777' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile details' }));
    await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith('Contact save unavailable'));
    expect(screen.getByPlaceholderText('10-digit mobile number')).toHaveValue('7777777777');
    expect(state.refreshUser).not.toHaveBeenCalled();
  });

  it('keeps a successful profile save separate from account refresh failure', async () => {
    state.refreshUser.mockRejectedValueOnce(new Error('Refresh unavailable'));
    render(<FacultyDetailsSettingsSection profileHref="/faculty/me" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save profile details' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Your profile details were saved, but account details could not be refreshed');
    expect(state.toast.success).toHaveBeenCalledWith('Profile details updated');
    expect(state.toast.error).not.toHaveBeenCalled();
  });

  it('ignores an old account profile read', async () => {
    let resolveOld!: (value: unknown) => void;
    state.api.get.mockReturnValue(new Promise(done => { resolveOld = done; }));
    const view = render(<FacultyDetailsSettingsSection profileHref="/faculty/me" />);
    state.user = { user_id: 'faculty-two', tenant_id: 'tenant-two' };
    state.api = { get: vi.fn().mockResolvedValue({ ...profile, name: 'Second Faculty', phone: '8888888888' }), patch: vi.fn() };
    view.rerender(<FacultyDetailsSettingsSection profileHref="/faculty/me" />);
    await screen.findByText('Second Faculty');
    await act(async () => resolveOld(profile));
    expect(screen.queryByText('First Faculty')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('10-digit mobile number')).toHaveValue('8888888888');
  });

  it('ignores an old save before it can refresh or overwrite the new account', async () => {
    let resolveOld!: (value: unknown) => void;
    state.api.patch.mockReturnValue(new Promise(done => { resolveOld = done; }));
    const view = render(<FacultyDetailsSettingsSection profileHref="/faculty/me" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save profile details' }));
    state.user = { user_id: 'faculty-two', tenant_id: 'tenant-two' };
    state.api = { get: vi.fn().mockResolvedValue({ ...profile, name: 'Second Faculty', phone: '8888888888' }), patch: vi.fn() };
    view.rerender(<FacultyDetailsSettingsSection profileHref="/faculty/me" />);
    await screen.findByText('Second Faculty');
    fireEvent.change(screen.getByPlaceholderText('10-digit mobile number'), { target: { value: '7777777777' } });
    await act(async () => resolveOld(profile));
    expect(state.refreshUser).not.toHaveBeenCalled();
    expect(state.toast.success).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('10-digit mobile number')).toHaveValue('7777777777');
  });
});
