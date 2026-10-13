import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HrLegacyReconciliationPanel } from '../HrLegacyReconciliationPanel';

const { post, useHrSWR, mutate, useAuth } = vi.hoisted(() => ({
  post: vi.fn(),
  useHrSWR: vi.fn(),
  mutate: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({ useAuth }));
vi.mock('@/lib/api/use-hr-api', () => ({ useHrApi: () => ({ post }) }));
vi.mock('@/context/HrEntityContext', () => ({ useHrEntity: () => ({ entityReady: true }) }));
vi.mock('@/hooks/useHrSWR', () => ({ useHrSWR }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const readyRequest = {
  leave_id: 'leave-123',
  employee_name: 'Legacy Employee',
  employee_id: 'EMP-123',
  request_type: 'LEAVE',
  leave_type: 'CASUAL',
  start_date: '2026-10-10',
  end_date: '2026-10-11',
  reason: 'Annual leave',
  can_reconcile: true,
};

describe('legacy approval reconciliation', () => {
  afterEach(cleanup);
  beforeEach(() => {
    useAuth.mockReset().mockReturnValue({ user: { role: 'HRAdmin', roles: ['HRAdmin'] } });
    mutate.mockReset().mockResolvedValue([readyRequest]);
    useHrSWR.mockReset().mockReturnValue({ data: [readyRequest], error: null, isLoading: false, mutate });
    post.mockReset().mockResolvedValue({ leave_id: 'leave-123', status: 'PENDING' });
  });

  it('requires a reason and sends eligible cases for fresh approval without approving them', async () => {
    render(<HrLegacyReconciliationPanel />);
    expect(screen.getByText(/This action does not approve a request/)).toBeInTheDocument();
    expect(useHrSWR).toHaveBeenCalledWith(
      'hr-legacy-approval-reconciliation',
      '/api/hr/admin/requests/legacy-reconciliation',
      expect.objectContaining({ revalidateOnMount: true }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review reconciliation' }));
    const submit = screen.getByRole('button', { name: 'Send for fresh manager/HOD approval' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Why must this legacy approval be rechecked?'), {
      target: { value: 'Missing original decision history' },
    });
    fireEvent.change(screen.getByPlaceholderText('Document or ticket reference'), {
      target: { value: 'AUDIT-2026-01' },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(post).toHaveBeenCalledWith(
      '/api/hr/admin/requests/leave-123/reconcile-legacy-approval',
      { reason: 'Missing original decision history', evidence_reference: 'AUDIT-2026-01' },
    ));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
  });

  it('keeps ambiguous legacy cases visible but blocks reconciliation', () => {
    useHrSWR.mockReturnValue({
      data: [{ ...readyRequest, can_reconcile: false, block_reason: 'Manager assignment is ambiguous' }],
      error: null,
      isLoading: false,
      mutate,
    });
    render(<HrLegacyReconciliationPanel />);
    expect(screen.getByRole('button', { name: 'Review reconciliation' })).toBeDisabled();
    expect(screen.getByText(/Manager assignment is ambiguous/)).toBeInTheDocument();
  });

  it('is not displayed or fetched for non-admin users', () => {
    useAuth.mockReturnValue({ user: { role: 'Employee', roles: ['Employee'] } });
    render(<HrLegacyReconciliationPanel />);
    expect(screen.queryByText('Legacy approval reconciliation')).not.toBeInTheDocument();
    expect(useHrSWR).toHaveBeenCalledWith(null, expect.any(String), expect.any(Object));
  });
});
