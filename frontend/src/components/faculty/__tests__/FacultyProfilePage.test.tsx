import type { ReactNode, SelectHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FacultyProfilePage } from '../FacultyProfilePage';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
  auth: { user: { user_id: 'faculty-1' }, token: 'token-1' },
  params: { get: vi.fn() }, toast: { success: vi.fn(), error: vi.fn() },
}));
function profile(name = 'First Faculty') {
  return {
    user_id: name === 'First Faculty' ? 'faculty-1' : 'faculty-2', name, display_name: name, honorific: null,
    email: 'faculty@test.edu', phone: null, role: 'Faculty', department: 'Science', employee_id: null, designation: 'Lecturer',
    joining_date: null, profile_photo_url: null, total_teaching_experience_years: null, industry_experience_years: 0,
    api_score: 0, active_mentees: 0, responsibilities: [],
    personal: { date_of_birth: null, blood_group: null, gender: null, emergency_contact_name: '', emergency_contact_phone: '', permanent_address: '', current_address: '' },
    kyc: { pan_masked: 'MASKED-PAN', aadhaar_masked: null, bank_masked: null, ifsc_code: null, pf_uan: null },
    research_identifiers: { orcid_id: '', scopus_id: '', google_scholar_url: '' },
    research_summary: { total_scopus_papers: 0, total_patents: 0, total_conference_papers: 0, total_books: 0, total_publications: 0, total_grants_inr: 0, total_grants_display: '0' },
    qualifications: [], workload: { courses: [], weekly_teaching_hours: 0, project_guides_count: 0, project_guides: [], phd_scholars_count: 0, phd_scholars: [] }, bank_change_pending: null,
  };
}
const qualification = { qual_id: 'qualification-1', degree_level: 'PG', degree_name: 'MSc', university: 'Test University', passing_year: 2020, specialization: null, document_proof_url: null };
vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => fixtures.auth }));
vi.mock('next/navigation', () => ({ useSearchParams: () => fixtures.params }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/lib/faculty-demo-mode', () => ({ withFacultyDemoFallback: (live: unknown) => live }));
vi.mock('@/components/self-service/MyDocumentsPanel', () => ({ MyDocumentsPanel: () => <p>Documents panel</p> }));
vi.mock('@/components/faculty', () => ({
  FacultyPageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  FacultyPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  FacultyPageLoading: ({ label }: { label: string }) => <p role="status">{label}</p>,
  FacultyPanel: ({ title, children }: { title: string; children: ReactNode }) => <section><h3>{title}</h3>{children}</section>,
  FacultyStatCard: ({ label, value }: { label: string; value: ReactNode }) => <p>{label}: {value}</p>,
  FacultyEmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  FacultyTabBar: ({ tabs, onChange }: { tabs: Array<{ id: string; label: string }>; onChange: (id: string) => void }) => <nav>{tabs.map((tab) => <button key={tab.id} onClick={() => onChange(tab.id)}>{tab.label}</button>)}</nav>,
}));
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api = { get: vi.fn().mockResolvedValue(profile()), patch: vi.fn().mockResolvedValue(profile()), post: vi.fn().mockResolvedValue(profile()) };
  fixtures.auth = { user: { user_id: 'faculty-1' }, token: 'token-1' };
  fixtures.params.get.mockReturnValue('overview');
});
afterEach(cleanup);
async function ready(name = 'First Faculty') { await screen.findByRole('heading', { name }); }
function tab(name: string) { fireEvent.click(screen.getByRole('button', { name, exact: true })); }
function fillBank() {
  fireEvent.change(screen.getByLabelText('New account number'), { target: { value: '123456789' } });
  fireEvent.change(screen.getByLabelText('IFSC code'), { target: { value: 'TEST0000001' } });
}
function fillQualification() {
  fireEvent.change(screen.getByLabelText('University *'), { target: { value: 'Test University' } });
  fireEvent.change(screen.getByLabelText('Degree name'), { target: { value: 'MSc' } });
  fireEvent.change(screen.getByLabelText('Passing year *'), { target: { value: '2020' } });
}

describe('faculty profile scope and save integrity', () => {
  it('honors a changed URL tab and browser Back instead of resurrecting an older manual tab', async () => {
    fixtures.params.get.mockReturnValue('research');
    const view = render(<FacultyProfilePage />);
    await ready();
    tab('Personal & KYC');
    fireEvent.change(screen.getByLabelText('Emergency contact name'), { target: { value: 'Preserved contact draft' } });
    fixtures.params.get.mockReturnValue('documents');
    view.rerender(<FacultyProfilePage />);
    expect(screen.getByText('Documents panel')).toBeInTheDocument();
    fixtures.params.get.mockReturnValue('research');
    view.rerender(<FacultyProfilePage />);
    expect(screen.getByRole('heading', { name: 'Research identifiers' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Your password')).not.toBeInTheDocument();
    tab('Personal & KYC');
    expect(screen.getByLabelText('Emergency contact name')).toHaveValue('Preserved contact draft');
    expect(fixtures.api.get).toHaveBeenCalledTimes(1);
  });

  it('unlocks a replacement API workspace with the same account and ignores the previous mutation', async () => {
    let resolve!: (value: ReturnType<typeof profile>) => void;
    const oldApi = fixtures.api;
    oldApi.patch.mockReturnValue(new Promise<ReturnType<typeof profile>>((done) => { resolve = done; }));
    const view = render(<FacultyProfilePage />);
    await ready();
    tab('Personal & KYC');
    fireEvent.click(screen.getByRole('button', { name: 'Save contact & address' }));
    fixtures.api = { get: vi.fn().mockResolvedValue(profile()), patch: vi.fn(), post: vi.fn() };
    view.rerender(<FacultyProfilePage />);
    await ready();
    tab('Personal & KYC');
    expect(screen.getByRole('button', { name: 'Save contact & address' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Emergency contact name'), { target: { value: 'Replacement draft' } });
    await act(async () => { resolve(profile('Old response')); });
    expect(screen.getByLabelText('Emergency contact name')).toHaveValue('Replacement draft');
    expect(fixtures.toast.success).not.toHaveBeenCalled();
  });

  it('retries a genuine initial profile read failure', async () => {
    fixtures.api.get.mockRejectedValueOnce(new Error('Profile offline')).mockResolvedValueOnce(profile());
    render(<FacultyProfilePage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading faculty profile…');
    expect(await screen.findByRole('alert')).toHaveTextContent('Profile offline');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await ready();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores an old initial GET after an account switch', async () => {
    let resolve!: (row: ReturnType<typeof profile>) => void;
    fixtures.api.get.mockReturnValue(new Promise<ReturnType<typeof profile>>((done) => { resolve = done; }));
    const view = render(<FacultyProfilePage />);
    fixtures.api = { get: vi.fn().mockResolvedValue(profile('Second Faculty')), patch: vi.fn(), post: vi.fn() };
    fixtures.auth = { user: { user_id: 'faculty-2' }, token: 'token-2' };
    view.rerender(<FacultyProfilePage />);
    await ready('Second Faculty');
    await act(async () => { resolve(profile()); });
    expect(screen.queryByRole('heading', { name: 'First Faculty' })).not.toBeInTheDocument();
  });

  it('clears already revealed confidential KYC and its password on an account switch', async () => {
    fixtures.api.post.mockResolvedValue({ ...profile(), kyc_revealed: { pan: 'PRIVATE-OLD-PAN' } });
    const view = render(<FacultyProfilePage />);
    await ready();
    tab('Personal & KYC');
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'mock-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reveal KYC' }));
    await screen.findByText('PRIVATE-OLD-PAN');
    fixtures.api = { get: vi.fn().mockResolvedValue(profile('Second Faculty')), patch: vi.fn(), post: vi.fn() };
    fixtures.auth = { user: { user_id: 'faculty-2' }, token: 'token-2' };
    view.rerender(<FacultyProfilePage />);
    await ready('Second Faculty');
    tab('Personal & KYC');
    expect(screen.queryByText('PRIVATE-OLD-PAN')).not.toBeInTheDocument();
    expect(screen.getByText('MASKED-PAN')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your password')).toHaveValue('');
  });

  it('guards duplicate contact saves, locks all controls and preserves the failed draft', async () => {
    let reject!: (error: Error) => void;
    fixtures.api.patch.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    render(<FacultyProfilePage />);
    await ready();
    tab('Personal & KYC');
    fireEvent.change(screen.getByLabelText('Emergency contact name'), { target: { value: 'Saved draft' } });
    const button = screen.getByRole('button', { name: 'Save contact & address' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(fixtures.api.patch).toHaveBeenCalledTimes(1);
    for (const label of ['Emergency contact name', 'Emergency phone', 'Permanent address', 'New account number', 'Profile photo']) expect(screen.getByLabelText(label)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Qualifications', exact: true })).toBeDisabled();
    await act(async () => { reject(new Error('Save offline')); });
    expect(screen.getByLabelText('Emergency contact name')).toHaveValue('Saved draft');
    expect(button).toBeEnabled();
    expect(fixtures.toast.error).toHaveBeenCalledWith('Save offline');
  });

  it('keeps a successful bank request pending after refresh fails, without losing another draft', async () => {
    fixtures.api.post.mockResolvedValue({ request_id: 'bank-1', status: 'PENDING_APPROVAL', created_at: '2026-10-19T00:00:00Z' });
    fixtures.api.get.mockResolvedValueOnce(profile()).mockRejectedValueOnce(new Error('Refresh offline'));
    render(<FacultyProfilePage />);
    await ready();
    tab('Personal & KYC');
    fireEvent.change(screen.getByLabelText('Emergency contact name'), { target: { value: 'Unrelated contact draft' } });
    fillBank();
    const button = screen.getByRole('button', { name: 'Submit for HR approval' });
    act(() => { fireEvent.submit(button.closest('form')!); fireEvent.submit(button.closest('form')!); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Changes saved, but the profile could not be refreshed. Refresh offline');
    expect(button).toBeDisabled();
    expect(screen.getByLabelText('New account number')).toHaveValue('');
    expect(screen.getByLabelText('Emergency contact name')).toHaveValue('Unrelated contact draft');
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
    expect(fixtures.toast.success).toHaveBeenCalledExactlyOnceWith('Bank change submitted for HR approval');
    expect(fixtures.toast.error).not.toHaveBeenCalled();
    fixtures.api.get.mockResolvedValue({ ...profile(), bank_change_pending: { request_id: 'bank-1', status: 'PENDING_APPROVAL', created_at: '2026-10-19T00:00:00Z' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Emergency contact name')).toHaveValue('Unrelated contact draft');
  });

  it('preserves a failed qualification draft and file, and retains the created row after a failed refresh', async () => {
    fixtures.api.post.mockRejectedValueOnce(new Error('Qualification offline')).mockResolvedValueOnce(qualification);
    fixtures.api.get.mockResolvedValueOnce(profile()).mockRejectedValueOnce(new Error('Refresh offline'));
    render(<FacultyProfilePage />);
    await ready();
    tab('Qualifications');
    fillQualification();
    const file = new File(['mock degree'], 'degree.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Degree certificate (PDF)'), { target: { files: [file] } });
    const button = screen.getByRole('button', { name: 'Add qualification' });
    fireEvent.submit(button.closest('form')!);
    await waitFor(() => expect(fixtures.toast.error).toHaveBeenCalledWith('Qualification offline'));
    expect(screen.getByLabelText('University *')).toHaveValue('Test University');
    expect((screen.getByLabelText('Degree certificate (PDF)') as HTMLInputElement).files?.[0]).toBe(file);
    fireEvent.submit(button.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Changes saved, but the profile could not be refreshed.');
    expect(screen.getByText('Test University')).toBeInTheDocument();
    expect(screen.getByLabelText('University *')).toHaveValue('');
    expect(fixtures.toast.success).toHaveBeenCalledExactlyOnceWith('Qualification added');
    expect(fixtures.toast.error).toHaveBeenCalledTimes(1);
  });

  it.each(['personal', 'research', 'kyc', 'bank', 'qualification', 'photo'] as const)('ignores old-account %s completion and does not refresh or overwrite the new profile', async (operation) => {
    let resolve!: (value: unknown) => void;
    const oldApi = fixtures.api;
    const pending = new Promise((done) => { resolve = done; });
    if (operation === 'personal' || operation === 'research') oldApi.patch.mockReturnValue(pending);
    else oldApi.post.mockReturnValue(pending);
    const view = render(<FacultyProfilePage />);
    await ready();
    if (operation === 'personal') {
      tab('Personal & KYC'); fireEvent.click(screen.getByRole('button', { name: 'Save contact & address' }));
    } else if (operation === 'research') {
      tab('Research & IQAC'); fireEvent.click(screen.getByRole('button', { name: 'Save research profile' }));
    } else if (operation === 'kyc') {
      tab('Personal & KYC'); fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'mock-password' } }); fireEvent.click(screen.getByRole('button', { name: 'Reveal KYC' }));
    } else if (operation === 'bank') {
      tab('Personal & KYC'); fillBank(); fireEvent.submit(screen.getByRole('button', { name: 'Submit for HR approval' }).closest('form')!);
    } else if (operation === 'qualification') {
      tab('Qualifications'); fillQualification(); fireEvent.submit(screen.getByRole('button', { name: 'Add qualification' }).closest('form')!);
    } else {
      fireEvent.change(screen.getByLabelText('Profile photo'), { target: { files: [new File(['mock'], 'photo.png', { type: 'image/png' })] } });
    }
    fixtures.api = { get: vi.fn().mockResolvedValue(profile('Second Faculty')), patch: vi.fn(), post: vi.fn() };
    fixtures.auth = { user: { user_id: 'faculty-2' }, token: 'token-2' };
    view.rerender(<FacultyProfilePage />);
    await ready('Second Faculty');
    tab('Personal & KYC');
    fireEvent.change(screen.getByLabelText('Emergency contact name'), { target: { value: 'New account draft' } });
    await act(async () => { resolve({ ...profile(), ...qualification, kyc_revealed: { pan: 'PRIVATE-OLD-PAN' } }); });
    expect(screen.getByLabelText('Emergency contact name')).toHaveValue('New account draft');
    expect(screen.getByRole('heading', { name: 'Second Faculty' })).toBeInTheDocument();
    expect(screen.queryByText('PRIVATE-OLD-PAN')).not.toBeInTheDocument();
    expect(oldApi.get).toHaveBeenCalledTimes(1);
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(fixtures.toast.error).not.toHaveBeenCalled();
  });

  it('ignores an old post-save profile refresh after the account changes', async () => {
    let resolve!: (value: ReturnType<typeof profile>) => void;
    const oldApi = fixtures.api;
    oldApi.post.mockResolvedValue(qualification);
    oldApi.get.mockResolvedValueOnce(profile()).mockReturnValueOnce(new Promise<ReturnType<typeof profile>>((done) => { resolve = done; }));
    const view = render(<FacultyProfilePage />);
    await ready();
    tab('Qualifications'); fillQualification();
    fireEvent.submit(screen.getByRole('button', { name: 'Add qualification' }).closest('form')!);
    await waitFor(() => expect(oldApi.get).toHaveBeenCalledTimes(2));
    fixtures.api = { get: vi.fn().mockResolvedValue(profile('Second Faculty')), patch: vi.fn(), post: vi.fn() };
    fixtures.auth = { user: { user_id: 'faculty-2' }, token: 'token-2' };
    view.rerender(<FacultyProfilePage />);
    await ready('Second Faculty');
    await act(async () => { resolve(profile()); });
    expect(screen.queryByRole('heading', { name: 'First Faculty' })).not.toBeInTheDocument();
  });
});
