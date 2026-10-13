import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingStep2 } from '../OnboardingStep2';
import {
  FACULTY_ONBOARDING_CONFIG,
  STUDENT_ONBOARDING_CONFIG,
} from '@/lib/onboarding/portal-onboarding';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  refreshUser: vi.fn(),
  replace: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ refreshUser: mocks.refreshUser }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({
  toast: { error: mocks.error, success: vi.fn() },
}));

const staffProfile = {
  blood_group: 'O+',
  staff_mobile: '9876543210',
  pan_number: 'ABCDE1234F',
  aadhaar_number: '123456789012',
  bank_account_no: '1234567890',
  ifsc_code: 'TEST0000001',
  gender: 'Male',
  date_of_birth: '1990-01-01',
  emergency_contact_name: 'Emergency contact',
  emergency_contact_phone: '9876543211',
  permanent_address: 'Address',
  current_address: 'Address',
  total_experience_years: '0',
  degree_level: 'PG',
  degree_name: 'M.Pharm',
  university: 'University',
  passing_year: '2015',
  documents: ['PHOTO', 'AADHAAR', 'PAN', 'HIGHEST_DEGREE'].map((doc_type) => ({
    doc_type,
    file_path: `tenant/docs/${doc_type}.pdf`,
    status: 'PENDING',
  })),
};

describe('onboarding submission with documents already uploaded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(staffProfile);
  });

  it('explains that the remaining blocker is a profile field, not the completed document checklist', async () => {
    render(<OnboardingStep2 config={FACULTY_ONBOARDING_CONFIG} />);
    await screen.findAllByText('4 of 4 uploaded · 100% complete');

    fireEvent.click(screen.getAllByRole('button', { name: /submit for verification/i })[0]);

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(
      'Complete the required profile fields: ORCID ID',
    ));
    expect(screen.getByText(/Your documents are separate from these required fields: ORCID ID/))
      .toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: /ORCID ID/ }), {
      target: { value: '0000-0002-1825-0097' },
    });
    expect(screen.queryByText(/Profile details still needed/)).not.toBeInTheDocument();
  });

  it('submits when both the profile and all documents are complete', async () => {
    mocks.get.mockResolvedValue({ ...staffProfile, orcid_id: '0000-0002-1825-0097' });
    mocks.post.mockResolvedValue({ onboarding_status: 'PENDING_ADMIN_APPROVAL' });
    mocks.refreshUser.mockResolvedValue(undefined);

    render(<OnboardingStep2 config={FACULTY_ONBOARDING_CONFIG} />);
    await screen.findAllByText('4 of 4 uploaded · 100% complete');
    fireEvent.click(screen.getAllByRole('button', { name: /submit for verification/i })[0]);

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/api/staff/onboarding/submit'));
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/staff/onboarding/profile',
      expect.objectContaining({ orcid_id: '0000-0002-1825-0097' }),
    );
    expect(mocks.replace).toHaveBeenCalledWith('/faculty/onboarding/step-3');
  });

  it('also distinguishes student profile fields from completed student documents', async () => {
    mocks.get.mockResolvedValue({
      blood_group: 'O+',
      student_mobile: '9876543210',
      abc_id: '123456789012',
      gender: 'Female',
      date_of_birth: '2005-01-01',
      father_name: 'Parent one',
      mother_name: 'Parent two',
      parent_contact_phone: '9876543211',
      emergency_contact_name: 'Parent one',
      permanent_address: 'Address',
      current_address: '',
      documents: ['PHOTO', 'AADHAAR', '10TH_MARKSHEET', '12TH_MARKSHEET'].map((doc_type) => ({
        doc_type,
        file_path: `tenant/docs/${doc_type}.pdf`,
        status: 'PENDING',
      })),
    });

    render(<OnboardingStep2 config={STUDENT_ONBOARDING_CONFIG} />);
    await screen.findAllByText('4 of 4 uploaded · 100% complete');
    fireEvent.click(screen.getAllByRole('button', { name: /submit for verification/i })[0]);

    expect(await screen.findByText(/Your documents are separate from these required fields: Current address/))
      .toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
