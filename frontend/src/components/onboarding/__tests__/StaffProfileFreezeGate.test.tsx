import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffProfileFreezeGate } from '../StaffProfileFreezeGate';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), logout: vi.fn(),
  onboardingStatus: 'COMPLETED',
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({
  user: { user_id: 'faculty-1', onboarding_status: mocks.onboardingStatus, role: 'Faculty' },
  logout: mocks.logout,
}) }));

describe('StaffProfileFreezeGate', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.onboardingStatus = 'COMPLETED'; });

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

  it('opens the prefilled recovery form for an initial-review pilot, without resetting onboarding', async () => {
    mocks.onboardingStatus = 'PENDING_ADMIN_APPROVAL';
    mocks.get.mockResolvedValue({ review_id: 'recovery', status: 'RETURNED_FOR_CORRECTION', source: 'INITIAL', recovery_required: true,
      profile: { staff_mobile: '9876543210' }, required_fields: ['staff_mobile'], requested_docs: [] });
    render(<StaffProfileFreezeGate initialReview><p>Old waiting room</p></StaffProfileFreezeGate>);
    expect(await screen.findByDisplayValue('9876543210')).toBeInTheDocument();
    expect(screen.queryByText('Old waiting room')).not.toBeInTheDocument();
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

  it('allows a new staff member to correct an initial HR review from onboarding', async () => {
    mocks.onboardingStatus = 'PENDING_ADMIN_APPROVAL';
    mocks.get.mockResolvedValue({ status: 'RETURNED_FOR_CORRECTION', source: 'INITIAL',
      requested_fields: ['staff_mobile'], requested_docs: [], return_reason: 'Please update mobile number' });
    render(<StaffProfileFreezeGate initialReview><p>Waiting for approval</p></StaffProfileFreezeGate>);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Corrections requested by HR');
    expect(screen.getByPlaceholderText('Correct Mobile number')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for approval')).not.toBeInTheDocument();
  });
});
