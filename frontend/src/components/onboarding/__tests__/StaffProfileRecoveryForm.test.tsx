import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffProfileRecoveryForm } from '../StaffProfileRecoveryForm';

const api = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
const requiredFields = ['staff_mobile', 'gender', 'date_of_birth', 'current_address', 'emergency_contact_name',
  'emergency_contact_phone', 'degree_level', 'degree_name', 'university', 'passing_year', 'permanent_address',
  'blood_group', 'pan_number', 'aadhaar_number', 'bank_account_no', 'ifsc_code', 'orcid_id', 'total_experience_years'];
const review = { review_id: 'recovery-1', profile: { staff_mobile: '9876543210', degree_name: 'MPharm', orcid_id: 'retained-id',
  gender: 'Female', date_of_birth: '1985-02-03', current_address: 'Jaipur', emergency_contact_name: 'Contact',
  emergency_contact_phone: '9876543211', degree_level: 'Masters', university: 'University', passing_year: '2015',
  permanent_address: 'Jaipur', blood_group: 'B+', pan_number: 'ABCDE1234F', aadhaar_number: '123456789012',
  bank_account_no: '12345678901', ifsc_code: 'TEST0000001', total_experience_years: '0' },
  required_fields: requiredFields, requested_fields: [], requested_docs: ['PAN'], corrected_docs: [] };
const complete = vi.fn();
const submit = () => fireEvent.submit(screen.getByRole('button', { name: 'Submit profile and documents to HR' }).closest('form')!);
describe('Faculty recovery form', () => {
  beforeEach(() => { vi.clearAllMocks(); api.post.mockResolvedValue({}); api.patch.mockResolvedValue({}); });
  it('prefills saved information, marks all 18 onboarding fields required and never offers skip', () => {
    render(<StaffProfileRecoveryForm review={review} onSubmitted={complete} onSignOut={vi.fn()} />);
    expect(screen.getByDisplayValue('9876543210')).toBeRequired();
    expect(screen.getByDisplayValue('MPharm')).toBeRequired();
    expect(screen.getByDisplayValue('retained-id')).toBeRequired();
    for (const key of requiredFields) expect(document.querySelector(`[name="${key}"]`)).toBeRequired();
    for (const key of ['pf_uan', 'specialization', 'industry_experience_years', 'scopus_id', 'google_scholar_url']) {
      expect(document.querySelector(`[name="${key}"]`)).not.toBeRequired();
    }
    expect(screen.getByText('Additional information — if applicable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('Existing file retained')).toHaveLength(3);
  });
  it('blocks submission if an essential identity or payroll field is empty', async () => {
    render(<StaffProfileRecoveryForm review={{ ...review, profile: { ...review.profile, bank_account_no: '' }, corrected_docs: ['PAN'] }} onSubmitted={complete} onSignOut={vi.fn()} />);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Complete the fields marked Required');
    expect(api.patch).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
  });
  it('accepts zero teaching experience and blank applicable extras', async () => {
    render(<StaffProfileRecoveryForm review={{ ...review, corrected_docs: ['PAN'] }} onSubmitted={complete} onSignOut={vi.fn()} />);
    expect(screen.getByRole('spinbutton', { name: /Teaching experience/ })).toHaveValue(0);
    submit(); await waitFor(() => expect(complete).toHaveBeenCalled());
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith('/api/staff/profile-review/me/resubmit');
  });
  it('requires an applicable extra when HR explicitly requests it', () => {
    render(<StaffProfileRecoveryForm review={{ ...review, requested_fields: ['pf_uan'] }} onSubmitted={complete} onSignOut={vi.fn()} />);
    expect(document.querySelector('[name="pf_uan"]')).toBeRequired();
  });
  it('retains dirty input across status refreshes and requires the missing replacement', async () => {
    const view = render(<StaffProfileRecoveryForm review={review} onSubmitted={complete} onSignOut={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue('9876543210'), { target: { value: '9876543219' } });
    view.rerender(<StaffProfileRecoveryForm review={{ ...review, profile: { ...review.profile, staff_mobile: 'old-server-value' } }} onSubmitted={complete} onSignOut={vi.fn()} />);
    expect(screen.getByDisplayValue('9876543219')).toBeInTheDocument();
    submit(); expect(await screen.findByRole('alert')).toHaveTextContent('Replacement required');
    expect(api.patch).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
  });
  it('uploads to the authenticated self route and patches only changed values', async () => {
    render(<StaffProfileRecoveryForm review={review} onSubmitted={complete} onSignOut={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Upload PAN card'), { target: { files: [new File(['pdf'], 'pan.pdf', { type: 'application/pdf' })] } });
    await screen.findByText('Replacement received');
    expect(api.post).toHaveBeenCalledWith('/api/staff/profile-review/me/documents/PAN', expect.any(FormData));
    fireEvent.change(screen.getByDisplayValue('9876543210'), { target: { value: '9876543219' } });
    submit();
    await waitFor(() => expect(complete).toHaveBeenCalled());
    expect(api.patch).toHaveBeenCalledWith('/api/staff/profile-review/me/corrections', { staff_mobile: '9876543219' });
    expect(api.post).toHaveBeenCalledWith('/api/staff/profile-review/me/resubmit');
  });
  it('does not erase saved optional fields or submit when uploads fail', async () => {
    api.post.mockRejectedValue(new Error('Storage not mounted'));
    render(<StaffProfileRecoveryForm review={review} onSubmitted={complete} onSignOut={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Upload PAN card'), { target: { files: [new File(['pdf'], 'pan.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage not mounted');
    expect(screen.getByDisplayValue('retained-id')).toBeInTheDocument();
    submit(); expect(complete).not.toHaveBeenCalled();
  });
  it('retains corrected details after submission failure and does not resend unchanged fields on retry', async () => {
    api.post.mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValue({});
    render(<StaffProfileRecoveryForm review={{ ...review, corrected_docs: ['PAN'] }} onSubmitted={complete} onSignOut={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue('9876543210'), { target: { value: '9876543219' } });
    submit(); expect(await screen.findByRole('alert')).toHaveTextContent('Temporary failure');
    expect(screen.getByDisplayValue('9876543219')).toBeInTheDocument();
    submit(); await waitFor(() => expect(complete).toHaveBeenCalled());
    expect(api.patch).toHaveBeenCalledTimes(1);
  });
});
