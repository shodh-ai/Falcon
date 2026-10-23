import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyOnboardingPanel } from '../MyOnboardingPanel';
import { MyPoliciesPanel } from '../MyPoliciesPanel';
import { MyPayslipsPanel } from '../MyPayslipsPanel';
import { MyHelpdeskPanel } from '../MyHelpdeskPanel';
import { MyCalendarPanel } from '../MyCalendarPanel';
import { DocumentVaultGrid } from '@/components/hr/DocumentVaultGrid';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
  fetch: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/lib/api/use-hr-api', () => ({ useHrApi: () => mocks.api }));
vi.mock('@/lib/api-base-url', () => ({ getApiBaseUrl: () => 'http://runtime-api.test', apiUrlRef: 'http://runtime-api.test' }));
vi.mock('@/lib/tenant', () => ({ getSubdomainFromClient: () => 'test' }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({ usePathname: () => '/faculty/me/workforce' }));
vi.mock('@/lib/faculty-demo-mode', () => ({
  withFacultyDemoFallback: (live: unknown) => live,
  isEmptyArray: (value: unknown[]) => value.length === 0,
}));
vi.mock('@/components/faculty', () => ({
  FacultyPanel: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  FacultyEmptyState: ({ title, description }: { title?: string; description?: string }) => <p>{title} {description}</p>,
  FacultyInlineLoading: ({ label }: { label: string }) => <p>{label}</p>,
}));
vi.mock('@/components/hr/HrAttendanceCalendar', () => ({ HrAttendanceCalendar: () => <div>Attendance grid</div> }));

const progress = (status: string) => ({
  is_new_hire: true, progress_percent: status === 'COMPLETED' ? 100 : 0,
  pipeline: { pipeline_id: 'my-pipeline' },
  steps: [{ step_key: 'PAN_UPLOAD', step_label: 'Upload PAN', status }],
});

beforeEach(() => { vi.clearAllMocks(); mocks.api.get.mockReset(); mocks.api.patch.mockReset(); vi.stubGlobal('fetch', mocks.fetch); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('self-service read failures', () => {
  it('retries onboarding load and recognizes the backend COMPLETED status', async () => {
    mocks.api.get.mockRejectedValueOnce(new Error('Onboarding unavailable')).mockResolvedValueOnce(progress('COMPLETED'));
    render(<MyOnboardingPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Onboarding unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument();
  });

  it('refreshes onboarding after completion and prevents duplicate actions while saving', async () => {
    mocks.api.get.mockResolvedValueOnce(progress('PENDING')).mockResolvedValueOnce(progress('COMPLETED'));
    let finish!: () => void;
    mocks.api.patch.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<MyOnboardingPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark done' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    finish();
    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(mocks.api.patch).toHaveBeenCalledWith('/api/hr/ess/onboarding/steps/PAN_UPLOAD', { pipeline_id: 'my-pipeline' });
  });

  it('shows failed onboarding save as recoverable rather than reporting completion', async () => {
    mocks.api.get.mockResolvedValue(progress('PENDING'));
    mocks.api.patch.mockRejectedValue(new Error('Unable to save step'));
    render(<MyOnboardingPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark done' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save step');
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it.each([
    ['policies', () => <MyPoliciesPanel />, 'No active policies'],
    ['payslips', () => <MyPayslipsPanel />, 'No payslips published yet.'],
    ['tickets', () => <MyHelpdeskPanel />, 'No tickets yet.'],
    ['documents', () => <DocumentVaultGrid mode="ess" />, 'No documents uploaded yet.'],
  ] as const)('shows a failed %s request instead of a successful empty state', async (_name, component, emptyText) => {
    mocks.api.get.mockRejectedValue(new Error('Service unavailable'));
    render(component());
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    expect(screen.queryByText(emptyText, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows a legitimate empty policy result after retrying a failed request', async () => {
    mocks.api.get.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce([]);
    render(<MyPoliciesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/No active policies/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps attendance visible while a calendar metadata failure can be retried', async () => {
    mocks.api.get.mockRejectedValueOnce(new Error('Calendar unavailable')).mockResolvedValueOnce({ month: '2026-10', shift: null, holidays: [], leaves: [] });
    render(<MyCalendarPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Calendar unavailable');
    expect(screen.getByText('Attendance grid')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No holidays scheduled this month.')).toBeInTheDocument();
  });

  it('uploads document bytes through the resolved runtime API host before registering the document', async () => {
    mocks.api.get.mockResolvedValue({ documents: [], groups: {} });
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ path: '/uploads/test-file.pdf' }) });
    mocks.api.post.mockResolvedValue({});
    const { container } = render(<DocumentVaultGrid mode="ess" />);
    await screen.findByText('No documents uploaded yet.');
    const file = new File(['mock'], 'proof.pdf', { type: 'application/pdf' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/hr/ess/documents', expect.objectContaining({ file_url: '/uploads/test-file.pdf' })));
    expect(mocks.fetch).toHaveBeenCalledWith('http://runtime-api.test/uploads/single', expect.objectContaining({ method: 'POST' }));
  });
});
