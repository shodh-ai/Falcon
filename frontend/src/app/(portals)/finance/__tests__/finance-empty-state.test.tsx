import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChequeClearingPage from '../cheque-clearing/page';
import FinanceGrievancesPage from '../grievances/page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks }));
vi.mock('@/lib/notifications/falcon-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

describe('Finance empty and error states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('distinguishes a failed cheque request from an empty pending queue', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Finance API unavailable'));
    render(<ChequeClearingPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Finance API unavailable');
    expect(screen.queryByText('No pending cheques. Log a verified deposit above when one is received.')).not.toBeInTheDocument();
  });

  it('explains how to use the cheque queue when it has no records', async () => {
    mocks.get.mockResolvedValueOnce([]);
    render(<ChequeClearingPage />);

    expect(await screen.findByText('No pending cheques. Log a verified deposit above when one is received.')).toBeInTheDocument();
  });

  it('does not report zero grievances when the request failed', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Helpdesk unavailable'));
    render(<FinanceGrievancesPage />);

    expect(await screen.findByText(/Could not load finance grievances.*Helpdesk unavailable/)).toBeInTheDocument();
    expect(screen.getByText('Tickets unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No open finance grievances.')).not.toBeInTheDocument();
  });
});
