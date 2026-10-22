import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamDayPage from '@/app/(portals)/exam-cell/exam-day/page';
const { api, toast, role } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, toast: { error: vi.fn(), success: vi.fn() }, role: { value: 'ExamCell' } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { roles: [role.value] } }) }));
const identity = { student: { user_id: 'synthetic-student', name: 'Synthetic Student', enrollment_number: 'SYNTH-001', branch: 'Synthetic', semester: 4 }, seating: [], verified: true };
beforeEach(() => { api.get.mockReset().mockResolvedValue([]); api.post.mockReset(); toast.error.mockReset(); toast.success.mockReset(); role.value = 'ExamCell'; });
async function verify(currentTicket: boolean) {
  api.post.mockResolvedValueOnce({ ...identity, hall_ticket_verified: currentTicket, ...(currentTicket ? { issue_id: 'synthetic-issue' } : {}) });
  render(<ExamDayPage />);
  fireEvent.change(screen.getByLabelText('Hall ticket QR or enrollment number'), { target: { value: currentTicket ? 'FALCON-HALL-TICKET:synthetic' : 'SYNTH-001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify', exact: true }));
  await screen.findByText('Synthetic Student');
}
describe('Printed hall-ticket verification controls', () => {
  it('does not present a manual identity lookup as a verified hall ticket', async () => {
    await verify(false);
    expect(screen.getByText('Student identity checked. Scan the printed QR to verify a hall ticket.')).toBeTruthy();
    expect(screen.queryByText('Current hall ticket verified')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke this hall ticket' })).toBeNull();
  });
  it('requires a reason and sends a revocation once while pending', async () => {
    await verify(true);
    expect(screen.getByText('Current hall ticket verified')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke this hall ticket' }));
    const confirm = screen.getByRole('button', { name: 'Confirm revocation' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Synthetic invalidation' } });
    let finish!: (value: object) => void;
    api.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenLastCalledWith('/api/exam-cell/hall-ticket-issues/synthetic-issue/revoke', { reason: 'Synthetic invalidation' });
    await act(async () => { finish({ revoked: true }); });
    await waitFor(() => expect(toast.success).toHaveBeenLastCalledWith('This hall-ticket record was revoked'));
    expect(screen.queryByText('Current hall ticket verified')).toBeNull();
  });
  it('does not claim success when the server has not confirmed revocation', async () => {
    await verify(true);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke this hall ticket' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Synthetic invalidation' } });
    api.post.mockResolvedValueOnce({ revoked: false });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revocation' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The server did not confirm hall-ticket revocation'));
    expect(screen.getByText('Current hall ticket verified')).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalledWith('This hall-ticket record was revoked');
  });
  it('hides revocation from a read-only role', async () => {
    role.value = 'Faculty';
    render(<ExamDayPage />);
    await screen.findByText('No exams scheduled for today.');
    const button = screen.getByRole('button', { name: 'Verify', exact: true });
    expect(button).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Revoke this hall ticket' })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });
});
