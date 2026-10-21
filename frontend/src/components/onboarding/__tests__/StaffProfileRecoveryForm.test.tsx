import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffProfileRecoveryForm } from '../StaffProfileRecoveryForm';

const api = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
const review = { review_id: 'recovery-1', profile: { staff_mobile: '9876543210', degree_name: 'MPharm', orcid_id: 'retained-id' },
  required_fields: ['staff_mobile', 'degree_name'], requested_fields: [], requested_docs: ['PAN'], corrected_docs: [] };
const complete = vi.fn();
const submit = () => fireEvent.submit(screen.getByRole('button', { name: 'Submit profile and documents to HR' }).closest('form')!);
describe('Faculty recovery form', () => {
  beforeEach(() => { vi.clearAllMocks(); api.post.mockResolvedValue({}); api.patch.mockResolvedValue({}); });
  it('prefills saved information, requires only core fields and never offers skip', () => {
    render(<StaffProfileRecoveryForm review={review} onSubmitted={complete} onSignOut={vi.fn()} />);
    expect(screen.getByDisplayValue('9876543210')).toBeRequired();
    expect(screen.getByDisplayValue('MPharm')).toBeRequired();
    expect(screen.getByDisplayValue('retained-id')).not.toBeRequired();
    expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('Existing file retained')).toHaveLength(3);
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
