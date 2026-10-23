import type { SelectHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeetingWorkspace } from '../MeetingWorkspace';

const state = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  user: { user_id: 'faculty-one', tenant_id: 'tenant-one' },
  query: '',
  president: { meetingActionItems: vi.fn() }, toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => state.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/lib/api/api.president', () => ({ usePresidentApi: () => state.president }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: state.toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/components/brand/FalconLoader', () => ({ FalconLoader: ({ label }: { label: string }) => <p>{label}</p> }));
vi.mock('@/lib/faculty-demo-mode', () => ({
  isEmptyArray: (value: unknown) => Array.isArray(value) && !value.length,
  isFacultyDemoModeEnabled: () => false, isFacultyDemoEntityId: () => false,
  isFacultyDemoSmokeId: () => false, withFacultyDemoFallback: (value: unknown) => value,
}));

const meeting = { meeting_id: 'meeting-one', title: 'First meeting', venue: 'Room one',
  starts_at: '2099-10-20T10:00:00Z', ends_at: '2099-10-20T11:00:00Z', status: 'SCHEDULED',
  meeting_mode: 'SCHEDULED', organizer_user_id: 'faculty-one', organizer_name: 'Organizer',
  requester_user_id: 'faculty-one', requester_name: 'Organizer', participants: [], agenda: 'Original agenda', minutes: null };
const participant = { user_id: 'invitee-one', name: 'Eligible Person', email: 'person@example.test', role_name: 'Faculty', relation: 'COLLEAGUE' };
const view = () => <MeetingWorkspace workspaceLabel="Faculty Portal" hidePageHeader />;

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { user_id: 'faculty-one', tenant_id: 'tenant-one' };
  state.query = '';
  state.api = { get: vi.fn().mockImplementation(async (path: string) => path === '/api/meetings' ? [meeting] : { participants: [participant] }), post: vi.fn().mockResolvedValue(meeting), patch: vi.fn().mockResolvedValue(meeting) };
});
afterEach(cleanup);

describe('meeting read states', () => {
  it('initializes a Contact HOD deep-link only after the eligible contacts arrive', async () => {
    state.query = 'compose=schedule&department=Computer+Science&role=hod';
    let resolveParticipants!: (value: object) => void;
    state.api.get.mockImplementation((path: string) => path === '/api/meetings'
      ? Promise.resolve([meeting])
      : new Promise(resolve => { resolveParticipants = resolve; }));
    render(view());
    expect(screen.getByLabelText('Meeting title')).toHaveValue('');
    expect(screen.getByText('Loading eligible invitees…')).toBeInTheDocument();
    await act(async () => resolveParticipants({ participants: [
      { ...participant, dept_name: 'Computer Science', name: 'Department colleague' },
      { ...participant, user_id: 'hod-one', name: 'Department Head', role_name: 'HOD', dept_name: 'Computer Science & Engineering' },
    ] }));
    expect(screen.getByRole('checkbox', { name: /Department Head/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Department colleague/ })).not.toBeChecked();
    expect(screen.getByLabelText('Meeting title')).toHaveValue('Academic coordination — Computer Science');
    expect(state.toast.success).toHaveBeenCalledExactlyOnceWith('Coordinating with Department Head (HOD, Computer Science)');
  });

  it('shows initial loading, then a persistent list failure and Retry without a false empty state', async () => {
    let reject!: (error: Error) => void;
    state.api.get.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    render(view());
    expect(screen.getByText('Loading meetings…')).toBeInTheDocument();
    await act(async () => reject(new Error('Meeting list unavailable')));
    expect(screen.getByRole('alert')).toHaveTextContent('Meeting list unavailable');
    expect(screen.queryByText('No meetings yet.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry meetings' }));
    await screen.findByLabelText('Edit meeting agenda');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps scheduling drafts when invitee loading fails and retries only the invitees', async () => {
    state.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/meetings') return [meeting];
      throw new Error('Invitees unavailable');
    });
    render(view());
    fireEvent.click(await screen.findByRole('button', { name: 'Schedule' }));
    fireEvent.change(screen.getByLabelText('Meeting title'), { target: { value: 'Retained schedule' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Invitees unavailable');
    expect(screen.queryByText('No eligible participants in your scope.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send invitations' })).toBeDisabled();
    state.api.get.mockImplementation(async () => ({ participants: [participant] }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry invitees' }));
    await screen.findByRole('checkbox');
    expect(screen.getByLabelText('Meeting title')).toHaveValue('Retained schedule');
    expect(state.api.get.mock.calls.filter(([path]) => path === '/api/meetings')).toHaveLength(1);
  });

  it('shows recipient errors and preserves request drafts through Retry', async () => {
    state.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/meetings') return [meeting];
      throw new Error('Recipients unavailable');
    });
    render(view());
    fireEvent.click(await screen.findByRole('button', { name: 'Request' }));
    fireEvent.change(screen.getByLabelText('Meeting request title'), { target: { value: 'Retained request' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Recipients unavailable');
    expect(screen.queryByText('No eligible recipients in your scope.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
    state.api.get.mockResolvedValue({ participants: [participant] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry recipients' }));
    await screen.findByRole('option', { name: 'Eligible Person (Faculty)' });
    expect(screen.getByLabelText('Meeting request title')).toHaveValue('Retained request');
  });

  it('ignores an old account list response', async () => {
    let resolveOld!: (value: unknown) => void;
    state.api.get.mockReturnValue(new Promise(resolve => { resolveOld = resolve; }));
    const rendered = render(view());
    state.user = { user_id: 'faculty-two', tenant_id: 'tenant-two' };
    state.api = { get: vi.fn().mockResolvedValue([{ ...meeting, title: 'New account meeting', organizer_user_id: 'faculty-two' }]), post: vi.fn(), patch: vi.fn() };
    rendered.rerender(view());
    await screen.findByRole('button', { name: /New account meeting/ });
    await act(async () => resolveOld([meeting]));
    expect(screen.queryByRole('button', { name: /First meeting/ })).not.toBeInTheDocument();
  });
});

describe('meeting write boundaries', () => {
  it('preserves unsaved minutes when the same meeting refreshes after an agenda save', async () => {
    state.api.get.mockImplementation(async () => [{ ...meeting, minutes: { notes: 'Original notes', decisions: '', action_items: '' } }]);
    render(view());
    const notes = await screen.findByLabelText('Meeting notes');
    await waitFor(() => expect(notes).toHaveValue('Original notes'));
    fireEvent.change(notes, { target: { value: 'Unsaved minute draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save agenda' }));
    await waitFor(() => expect(state.api.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save agenda' })).toBeEnabled());
    expect(screen.getByLabelText('Meeting notes')).toHaveValue('Unsaved minute draft');
  });

  it('blocks same-tick duplicate agenda saves and locks editors until completion', async () => {
    let resolve!: (value: unknown) => void;
    state.api.patch.mockReturnValue(new Promise(done => { resolve = done; }));
    render(view());
    await screen.findByLabelText('Edit meeting agenda');
    const save = screen.getByRole('button', { name: 'Save agenda' });
    act(() => { fireEvent.click(save); fireEvent.click(save); });
    expect(state.api.patch).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Edit meeting agenda')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeDisabled();
    await act(async () => resolve(meeting));
    await waitFor(() => expect(save).toBeEnabled());
  });

  it('keeps a confirmed write successful when its list refresh fails, with a persistent Retry', async () => {
    render(view());
    fireEvent.change(await screen.findByLabelText('Edit meeting agenda'), { target: { value: 'Updated agenda draft' } });
    state.api.get.mockRejectedValue(new Error('Refresh unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Save agenda' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(state.toast.success).toHaveBeenCalledWith('Agenda updated');
    expect(state.toast.error).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Edit meeting agenda')).toHaveValue('Updated agenda draft');
    expect(screen.getByRole('button', { name: 'Save agenda' })).toBeDisabled();
  });

  it('does not refresh the new account when an old agenda save finishes', async () => {
    let resolveOld!: (value: unknown) => void;
    const oldApi = state.api;
    oldApi.patch.mockReturnValue(new Promise(resolve => { resolveOld = resolve; }));
    const rendered = render(view());
    fireEvent.click(await screen.findByRole('button', { name: 'Save agenda' }));
    state.user = { user_id: 'faculty-two', tenant_id: 'tenant-two' };
    state.api = { get: vi.fn().mockResolvedValue([{ ...meeting, title: 'New account meeting', organizer_user_id: 'faculty-two' }]), post: vi.fn(), patch: vi.fn() };
    rendered.rerender(view());
    const newAgenda = await screen.findByLabelText('Edit meeting agenda');
    fireEvent.change(newAgenda, { target: { value: 'New account draft' } });
    await act(async () => resolveOld(meeting));
    expect(newAgenda).toHaveValue('New account draft');
    expect(state.api.get).toHaveBeenCalledTimes(1);
    expect(state.toast.success).not.toHaveBeenCalled();
  });

  it('reports a partial executive action-item failure without pretending minutes failed', async () => {
    state.president.meetingActionItems.mockRejectedValueOnce(new Error('Queue unavailable'));
    render(<MeetingWorkspace workspaceLabel="Faculty Portal" hidePageHeader syncExecutiveActionItems />);
    await waitFor(() => expect(screen.getByLabelText('Edit meeting agenda')).toHaveValue('Original agenda'));
    fireEvent.change(await screen.findByLabelText('Meeting notes'), { target: { value: 'Confirmed minutes' } });
    fireEvent.change(screen.getByLabelText('Meeting action items'), { target: { value: 'Review attendance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish minutes' }));
    await waitFor(() => expect(state.toast.success).toHaveBeenCalledWith('Minutes published'));
    expect(state.api.post).toHaveBeenCalledTimes(1);
    expect(state.toast.error).toHaveBeenCalledWith(expect.stringContaining('Minutes were published, but executive action items'));
    expect(state.toast.success).not.toHaveBeenCalledWith(expect.stringContaining('Created'));
  });
});
