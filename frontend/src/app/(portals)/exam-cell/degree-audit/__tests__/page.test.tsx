import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamCellDegreeAuditPage from '../page';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('@/lib/api', () => ({
  useAuthedApi: () => ({ post }),
}));

vi.mock('@/lib/notifications/falcon-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/exam-cell/ExamCellPageHeader', () => ({
  ExamCellPageHeader: () => <div>Degree audit</div>,
}));

describe('Exam Cell degree audit status display', () => {
  beforeEach(() => post.mockReset());

  it('renders unavailable clearances as not verified, never as a pass', async () => {
    post.mockResolvedValue({
      final_status: 'PENDING',
      credits_earned: 180,
      credits_required: 160,
      cgpa_earned: 7.5,
      cgpa_required: 5,
      pending_backlogs: null,
      clearance_statuses: {
        credits: 'CLEARED',
        cgpa: 'CLEARED',
        backlogs: 'UNAVAILABLE',
        finance: 'UNAVAILABLE',
        library: 'UNAVAILABLE',
        hostel: 'UNAVAILABLE',
      },
      requirements_policy_status: 'UNCONFIRMED',
    });

    render(<ExamCellDegreeAuditPage />);
    fireEvent.change(
      screen.getByPlaceholderText(/Student user ID/i),
      { target: { value: '11111111-1111-4111-8111-111111111111' } },
    );
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText('PENDING')).toBeTruthy());
    expect(screen.getAllByText('Not verified').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pass')).toBeNull();
    expect(screen.getAllByText(/policy unconfirmed/i).length).toBeGreaterThan(0);
  });
});
