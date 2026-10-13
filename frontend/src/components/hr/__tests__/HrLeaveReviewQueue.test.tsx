import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HrLeaveReviewQueue } from '../HrLeaveReviewQueue';

const { patch, useHrSWR, mutate } = vi.hoisted(() => ({ patch: vi.fn(), useHrSWR: vi.fn(), mutate: vi.fn() }));

vi.mock('@/lib/api/use-hr-api', () => ({ useHrApi: () => ({ patch }) }));
vi.mock('@/context/HrEntityContext', () => ({ useHrEntity: () => ({ entityReady: true }) }));
vi.mock('@/hooks/useHrSWR', () => ({ useHrSWR }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const regularization = {
  leave_id: 'review-1',
  request_type: 'REGULARIZATION',
  leave_type: 'REGULARIZATION',
  employee_name: 'Test Employee',
  employee_id: 'EMP-42',
  start_date: '2026-10-10',
  end_date: '2026-10-10',
  regularization_date: '2026-10-10',
  missed_punch_type: 'IN',
  applied_at: '2026-10-11T09:15:00Z',
  reason: 'Missed check-in',
  status: 'HOD_APPROVED',
  recorded_check_in: null,
  recorded_check_out: null,
};

describe('HR final review queue', () => {
  afterEach(cleanup);
  beforeEach(() => {
    mutate.mockReset().mockResolvedValue([regularization]);
    useHrSWR.mockReset().mockReturnValue({ data: [regularization], error: null, isLoading: false, mutate });
    patch.mockReset().mockResolvedValue({ status: 'HR_APPROVED' });
  });

  it('shows only the requested review type and records final approval', async () => {
    render(<HrLeaveReviewQueue requestType="REGULARIZATION" />);
    expect(await screen.findByText('Test Employee')).toBeInTheDocument();
    expect(screen.getByText(/Attendance date: 2026-10-10/)).toBeInTheDocument();
    expect(screen.getByText(/no check-in/)).toBeInTheDocument();
    expect(screen.getByText(/Requested correction: missing check-in/)).toBeInTheDocument();
    expect(screen.getByText(/Submitted:/)).toBeInTheDocument();
    expect(useHrSWR).toHaveBeenCalledWith(
      ['hr-leave-review', 'REGULARIZATION'],
      '/api/hr/leaves/review?request_type=REGULARIZATION',
      expect.objectContaining({ revalidateOnMount: true }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Final HR Approve' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/api/hr/leaves/review/review-1', { action: 'APPROVE' }));
  });

  it('does not show an empty queue as a successful review after a fetch failure', async () => {
    useHrSWR.mockReturnValue({ data: [], error: new Error('Service unavailable'), isLoading: false, mutate });
    render(<HrLeaveReviewQueue requestType="LEAVE" />);
    expect(await screen.findByText('Service unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No pending leaves')).not.toBeInTheDocument();
  });
});
