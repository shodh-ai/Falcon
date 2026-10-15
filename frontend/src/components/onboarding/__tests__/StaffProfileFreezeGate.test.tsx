import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffProfileFreezeGate } from '../StaffProfileFreezeGate';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), logout: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({
  user: { user_id: 'faculty-1', onboarding_status: 'COMPLETED', role: 'Faculty' },
  logout: mocks.logout,
}) }));

describe('StaffProfileFreezeGate', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows the freeze popup and does not render normal faculty work', async () => {
    mocks.get.mockResolvedValue({ status: 'PENDING_HR', source: 'PHARMACY_RECHECK' });
    render(<StaffProfileFreezeGate><button>Mark attendance</button></StaffProfileFreezeGate>);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Account temporarily frozen');
    expect(screen.queryByText('Mark attendance')).not.toBeInTheDocument();
  });

  it('allows normal work after HR approves', async () => {
    mocks.get.mockResolvedValue({ status: 'APPROVED', source: 'PHARMACY_RECHECK' });
    render(<StaffProfileFreezeGate><button>Mark attendance</button></StaffProfileFreezeGate>);
    expect(await screen.findByText('Mark attendance')).toBeInTheDocument();
  });

  it('does not falsely freeze an account when the review lookup is unavailable', async () => {
    mocks.get.mockRejectedValue(new Error('Review service unavailable'));
    render(<StaffProfileFreezeGate><button>Mark attendance</button></StaffProfileFreezeGate>);
    expect(await screen.findByText('Mark attendance')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('offers only corrections requested by HR', async () => {
    mocks.get.mockResolvedValue({
      status: 'RETURNED_FOR_CORRECTION', source: 'PHARMACY_RECHECK',
      requested_fields: ['orcid_id'], requested_docs: [], return_reason: 'ORCID is incorrect',
      corrected_fields: [], corrected_docs: [],
    });
    mocks.patch.mockResolvedValue({ status: 'RETURNED_FOR_CORRECTION' });
    mocks.post.mockResolvedValue({ status: 'PENDING_HR' });
    render(<StaffProfileFreezeGate><button>Mark attendance</button></StaffProfileFreezeGate>);
    await screen.findByText(/ORCID is incorrect/);
    fireEvent.change(screen.getByPlaceholderText('Correct ORCID ID'), {
      target: { value: '0000-0002-1825-0097' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit corrections to HR' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith(
      '/api/staff/profile-review/me/corrections', { orcid_id: '0000-0002-1825-0097' },
    ));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/api/staff/profile-review/me/resubmit'));
  });
});
