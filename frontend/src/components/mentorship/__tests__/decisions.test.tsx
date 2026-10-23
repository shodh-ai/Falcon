import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingMeetingRequests } from '../PendingMeetingRequests';
import { PendingLeaveRequests } from '../PendingLeaveRequests';

const state = vi.hoisted(() => ({ api: { post: vi.fn() }, toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => state.api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: state.toast }));
vi.mock('@/lib/faculty-demo-mode', () => ({ isFacultyDemoSmokeId: () => false }));
vi.mock('@/components/faculty', () => ({
  FacultyPanel: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  FacultyEmptyState: () => null,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
const meeting = { meeting_id: 'meeting-one', student_name: 'Student', requested_time: '2099-10-20T10:00:00Z', topic: 'Mentoring', status: 'PENDING' };
const leave = { interaction_id: 'leave-one', student_name: 'Student', reason: 'Family event', start_date: '2099-10-20', end_date: '2099-10-21', status: 'PENDING' };
beforeEach(() => { vi.clearAllMocks(); state.api = { post: vi.fn().mockResolvedValue({}) }; });
afterEach(cleanup);

describe('mentorship child decision guards', () => {
  it('sends one meeting approval and locks row, dialog and remarks controls', async () => {
    let resolve!: (value: unknown) => void;
    state.api.post.mockReturnValue(new Promise(done => { resolve = done; }));
    const updated = vi.fn();
    render(<PendingMeetingRequests meetings={[meeting]} onUpdated={updated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.change(screen.getByPlaceholderText('Meet link or room number'), { target: { value: 'Room 405' } });
    const confirm = screen.getByRole('button', { name: 'Confirm approval' });
    act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
    expect(state.api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByPlaceholderText('Meet link or room number')).toBeDisabled();
    await act(async () => resolve({}));
    expect(updated).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('preserves meeting remarks and unlocks controls after a failed decision', async () => {
    state.api.post.mockRejectedValueOnce(new Error('Decision unavailable'));
    render(<PendingMeetingRequests meetings={[meeting]} onUpdated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.change(screen.getByPlaceholderText('Meet link or room number'), { target: { value: 'Room 405' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith('Decision unavailable'));
    expect(screen.getByPlaceholderText('Meet link or room number')).toHaveValue('Room 405');
    expect(screen.getByRole('button', { name: 'Confirm approval' })).toBeEnabled();
  });

  it('ignores a meeting decision that finishes after the API account changes', async () => {
    let resolve!: (value: unknown) => void;
    state.api.post.mockReturnValue(new Promise(done => { resolve = done; }));
    const updated = vi.fn();
    const view = render(<PendingMeetingRequests meetings={[meeting]} onUpdated={updated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.change(screen.getByPlaceholderText('Meet link or room number'), { target: { value: 'Room 405' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    state.api = { post: vi.fn() };
    view.rerender(<PendingMeetingRequests meetings={[{ ...meeting, meeting_id: 'new-meeting' }]} onUpdated={updated} />);
    await act(async () => resolve({}));
    expect(updated).not.toHaveBeenCalled();
    expect(state.toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it.each(['APPROVED', 'REJECTED'])('sends only one same-tick leave %s decision', async status => {
    let resolve!: (value: unknown) => void;
    state.api.post.mockReturnValue(new Promise(done => { resolve = done; }));
    const updated = vi.fn();
    render(<PendingLeaveRequests requests={[leave]} onUpdated={updated} />);
    if (status === 'REJECTED') {
      fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
      fireEvent.change(screen.getByPlaceholderText('Remarks (required if declining)'), { target: { value: 'Assessment scheduled' } });
    }
    const button = screen.getByRole('button', { name: status === 'APPROVED' ? 'Approve' : 'Decline' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(state.api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
    await act(async () => resolve({}));
    expect(updated).toHaveBeenCalledTimes(1);
  });

  it('does not refresh the new account when an old leave decision completes', async () => {
    let resolve!: (value: unknown) => void;
    state.api.post.mockReturnValue(new Promise(done => { resolve = done; }));
    const updated = vi.fn();
    const view = render(<PendingLeaveRequests requests={[leave]} onUpdated={updated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    state.api = { post: vi.fn() };
    view.rerender(<PendingLeaveRequests requests={[{ ...leave, interaction_id: 'new-leave' }]} onUpdated={updated} />);
    await act(async () => resolve({}));
    expect(updated).not.toHaveBeenCalled();
    expect(state.toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });
});
