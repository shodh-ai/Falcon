import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileCorrectionWidget } from '@/components/hod/ProfileCorrectionWidget';

const { get, patch, api, toast } = vi.hoisted(() => {
  const get = vi.fn();
  const patch = vi.fn();
  return {
    get,
    patch,
    api: { get, patch },
    toast: { error: vi.fn(), success: vi.fn() },
  };
});

vi.mock('@/lib/api', () => ({
  useAuthedApi: () => api,
}));

vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));

const ticket = {
  ticket_id: '00000000-0000-4000-8000-000000000001',
  subject: 'Update phone number',
  description: 'Please correct my phone number',
  category: 'STUDENT_PROFILE',
  status: 'PENDING',
  created_at: '2026-10-06T00:00:00.000Z',
};

describe('ProfileCorrectionWidget', () => {
  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
    toast.error.mockReset();
    toast.success.mockReset();
  });

  it('commits approval, disables duplicate actions, and removes the request after reload', async () => {
    get.mockResolvedValueOnce([ticket]).mockResolvedValueOnce([]);
    patch.mockResolvedValue({ ...ticket, status: 'RESOLVED' });

    render(<ProfileCorrectionWidget />);
    const approve = await screen.findByRole('button', { name: /Approve \(15 min unlock\)/i });
    fireEvent.click(approve);

    await waitFor(() => expect(patch).toHaveBeenCalledWith(
      `/api/helpdesk/tickets/${ticket.ticket_id}/status`,
      { status: 'RESOLVED', rejection_reason: undefined },
    ));
    await waitFor(() => expect(screen.queryByText(ticket.subject)).toBeNull());
    expect(toast.success).toHaveBeenCalledWith('Approved — 15-minute edit window opened');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('keeps the request visible and reports the API error when approval fails', async () => {
    get.mockResolvedValue([ticket]);
    patch.mockRejectedValue(new Error('Ticket is outside your department scope'));

    render(<ProfileCorrectionWidget />);
    const approve = await screen.findByRole('button', { name: /Approve \(15 min unlock\)/i });
    fireEvent.click(approve);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ticket is outside your department scope'));
    expect(screen.getByText(ticket.subject)).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent('Ticket is outside your department scope');
  });
});
