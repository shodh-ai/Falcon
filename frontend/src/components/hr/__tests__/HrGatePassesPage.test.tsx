import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HrGatePassesPage from '@/app/(portals)/hr/gate-passes/page';
const mocks = vi.hoisted(() => ({ patch: vi.fn(), swr: vi.fn(), mutate: vi.fn() }));
vi.mock('@/hooks/useHrSWR', () => ({ useHrSWR: mocks.swr }));
vi.mock('@/lib/api/use-hr-api', () => ({ useHrApi: () => ({ patch: mocks.patch }) }));
vi.mock('@/context/HrEntityContext', () => ({ useHrEntity: () => ({ entityReady: true }) }));
const pass = { pass_id: 'pass-1', employee_name: 'Employee', employee_email: 'employee@example.invalid', dept_name: 'Pharmacy',
  out_time: '2026-10-22T10:00:00Z', expected_in_time: '2026-10-22T11:00:00Z', reason: 'Official appointment', status: 'PENDING_HR', can_review: true };
describe('HR Gate Pass review page', () => {
  afterEach(cleanup);
  beforeEach(() => { mocks.patch.mockReset().mockResolvedValue({ status: 'APPROVED' }); mocks.mutate.mockReset();
    mocks.swr.mockReturnValue({ data: [pass], error: null, isLoading: false, mutate: mocks.mutate }); });
  it('loads the scoped review endpoint and saves final decisions', async () => {
    render(<HrGatePassesPage />);
    expect(screen.getByText('Employee')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Final HR Approve' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/api/hr/gate-passes/pass-1/hr-action', { status: 'APPROVED' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Gate pass approved');
    expect(mocks.mutate).toHaveBeenCalled();
  });
  it('keeps reporting-officer-pending rows read-only', () => {
    mocks.swr.mockReturnValue({ data: [{ ...pass, status: 'PENDING', can_review: false }], mutate: mocks.mutate });
    render(<HrGatePassesPage />);
    expect(screen.getByText(/Awaiting reporting-officer approval/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Final HR Approve' })).not.toBeInTheDocument();
  });
  it('does not offer final approval to an unassigned or previous approver', () => {
    mocks.swr.mockReturnValue({ data: [{ ...pass, can_review: false }], mutate: mocks.mutate });
    render(<HrGatePassesPage />);
    expect(screen.getByText(/Awaiting the assigned independent HR reviewer/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });
  it('shows failures without claiming successful approval', async () => {
    mocks.patch.mockRejectedValue(new Error('Scope changed'));
    render(<HrGatePassesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Scope changed');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
