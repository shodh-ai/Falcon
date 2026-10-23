import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingStep2 } from '../OnboardingStep2';
import { FACULTY_ONBOARDING_CONFIG, STAFF_DOC_LABELS } from '@/lib/onboarding/portal-onboarding';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() }, replace: vi.fn(), update: vi.fn(),
  success: vi.fn(), error: vi.fn(),
  account: { token: 'token-1', user: { user_id: 'faculty-1' } },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ ...mocks.account, updateOnboardingStatus: mocks.update }) }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/components/student/OnboardingDocDropzone', () => ({
  OnboardingDocDropzone: ({ label, disabled, onFile }: { label: string; disabled: boolean; onFile: (file: File) => void }) =>
    <button disabled={disabled} onClick={() => onFile(new File(['synthetic fixture'], 'test.pdf'))}>Upload {label}</button>,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function profile(mobile = '9000000001') {
  return { staff_mobile: mobile, documents: Object.keys(STAFF_DOC_LABELS).map((doc_type) => ({ doc_type, file_path: 'fixture.pdf', status: 'UPLOADED' })) };
}
function renderProfile() { return render(<OnboardingStep2 config={FACULTY_ONBOARDING_CONFIG} />); }
async function loaded() { await screen.findByLabelText(/Mobile number/); }
function submit() { fireEvent.click(screen.getAllByRole('button', { name: 'Submit for verification' })[0]); }

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account = { token: 'token-1', user: { user_id: 'faculty-1' } };
  mocks.api.get.mockResolvedValue(profile());
  mocks.api.post.mockResolvedValue({ onboarding_status: 'PENDING_ADMIN_APPROVAL' });
});
afterEach(cleanup);

describe('onboarding profile ownership and submission', () => {
  it('shows a profile read failure with Retry rather than an empty editable form', async () => {
    mocks.api.get.mockRejectedValueOnce(new Error('Profile unavailable'));
    renderProfile();
    await screen.findByText('Profile unavailable');
    expect(screen.queryByLabelText(/Mobile number/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await loaded();
    expect(screen.getByLabelText(/Mobile number/)).toHaveValue('9000000001');
  });

  it('ignores the previous account profile when responses complete out of order', async () => {
    const old = deferred<ReturnType<typeof profile>>();
    mocks.api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(profile('9000000002'));
    const view = renderProfile();
    mocks.account = { token: 'token-2', user: { user_id: 'faculty-2' } };
    view.rerender(<OnboardingStep2 config={FACULTY_ONBOARDING_CONFIG} />);
    await loaded();
    await act(async () => old.resolve(profile('9000000001')));
    expect(screen.getByLabelText(/Mobile number/)).toHaveValue('9000000002');
  });

  it('locks editing, uploads, and duplicate submissions while saving then opens the waiting room', async () => {
    const save = deferred<unknown>();
    mocks.api.post.mockReturnValueOnce(save.promise).mockResolvedValueOnce({ onboarding_status: 'PENDING_ADMIN_APPROVAL' });
    renderProfile(); await loaded();
    const submitButton = screen.getAllByRole('button', { name: 'Submit for verification' })[0];
    fireEvent.click(submitButton); fireEvent.click(submitButton);
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/Mobile number/)).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Upload PAN Card' })[0]).toBeDisabled();
    await act(async () => save.resolve({}));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/faculty/onboarding/step-3'));
    expect(mocks.update).toHaveBeenCalledWith('PENDING_ADMIN_APPROVAL');
  });

  it('does not submit the old account after its profile save completes on a new account', async () => {
    const save = deferred<unknown>(); mocks.api.post.mockReturnValueOnce(save.promise);
    const view = renderProfile(); await loaded(); submit();
    mocks.account = { token: 'token-2', user: { user_id: 'faculty-2' } };
    mocks.api.get.mockResolvedValue(profile('9000000002'));
    view.rerender(<OnboardingStep2 config={FACULTY_ONBOARDING_CONFIG} />); await loaded();
    await act(async () => save.resolve({}));
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Mobile number/)).toHaveValue('9000000002');
  });

  it.each([null, 'PENDING_DOCUMENTS', 'UNKNOWN'])('keeps the draft when the submit response has not advanced onboarding (%s)', async (status) => {
    mocks.api.post.mockResolvedValueOnce({}).mockResolvedValueOnce({ onboarding_status: status });
    renderProfile(); await loaded();
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: '9000000003' } }); submit();
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Mobile number/)).toHaveValue('9000000003');
    expect(screen.getByLabelText(/Mobile number/)).toBeEnabled();
  });

  it('accepts an authoritative completed stage for an idempotent submission', async () => {
    mocks.api.post.mockResolvedValueOnce({}).mockResolvedValueOnce({ onboarding_status: 'COMPLETED' });
    renderProfile(); await loaded(); submit();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/faculty/dashboard'));
  });
});
