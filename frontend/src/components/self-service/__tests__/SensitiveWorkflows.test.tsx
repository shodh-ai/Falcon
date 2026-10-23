import type { ReactNode, SelectHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentVaultGrid } from '@/components/hr/DocumentVaultGrid';
import { MyPayslipsPanel } from '../MyPayslipsPanel';
import { TeamRequestsPanel } from '../TeamRequestsPanel';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  auth: { user: { user_id: 'faculty-1', role: 'Faculty', roles: ['Faculty'] }, token: 'token-1' },
  pathname: '/faculty/me/workforce', teamScope: 'direct', fetch: vi.fn(), toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/lib/api/use-hr-api', () => ({ useHrApi: () => fixtures.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => fixtures.auth }));
vi.mock('next/navigation', () => ({ usePathname: () => fixtures.pathname }));
vi.mock('@/lib/api-base-url', () => ({ getApiBaseUrl: () => 'http://fixture-api.test', apiUrlRef: 'http://fixture-api.test' }));
vi.mock('@/lib/tenant', () => ({ getSubdomainFromClient: () => 'synthetic' }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/components/self-service/TeamScopeBar', () => ({ TeamScopeBar: () => null, useTeamScope: () => fixtures.teamScope }));
vi.mock('@/components/hod/HodGatePassApprovalsPanel', () => ({ HodGatePassApprovalsPanel: () => null }));
vi.mock('@/components/hr/HrAvatar', () => ({ HrPersonCell: ({ name }: { name: string }) => <span>{name}</span> }));
vi.mock('@/lib/faculty-demo-mode', () => ({ withFacultyDemoFallback: (live: unknown) => live, isEmptyArray: (rows: unknown[]) => !rows.length }));
vi.mock('@/lib/mock/faculty-portal-demo-modules', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/mock/faculty-portal-demo-modules')>()), facultyDemoTeamRequests: () => [] }));
vi.mock('@/components/faculty', () => ({
  FacultyPanel: ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  FacultyEmptyState: ({ title, description }: { title?: string; description?: string }) => <p>{title} {description}</p>,
  FacultyMetricChip: ({ label, value }: { label: string; value: ReactNode }) => <p>{label}: {value}</p>,
}));

function vault(file = 'Synthetic degree.pdf', status = 'PENDING') {
  const doc = { document_id: file, document_type: 'DEGREE', file_name: file, verification_status: status, uploaded_at: '2026-10-19' };
  return { documents: [doc], groups: { Academic: [doc] }, categories: [] };
}
const month = (net = 100) => ({ payslip_id: `salary-${net}`, month: '10', year: 2026, net_pay: net, period_key: '2026-10' });
const salaryRequest = { request_id: 'salary-request-1', period_from: '2026-10', period_to: '2026-10', reason: 'Synthetic bank documentation', status: 'PENDING', created_at: '2026-10-19' };
const counts = { leaves: 2, regularization: 0, onDuty: 0, compOff: 0, documents: 0, appraisals: 0, attendanceOverrides: 0 };
function teamRow(id: string, name: string, type = 'LEAVE') {
  return { id, request_type: type, leave_type: type, applied_date: null, raised_on: null, reason: null, status: 'PENDING', employee: { name } };
}
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn().mockResolvedValue({}), patch: vi.fn().mockResolvedValue({}) };
  fixtures.auth = { user: { user_id: 'faculty-1', role: 'Faculty', roles: ['Faculty'] }, token: 'token-1' };
  fixtures.teamScope = 'direct'; fixtures.pathname = '/faculty/me/workforce';
  fixtures.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: '/uploads/synthetic/proof.pdf', path: 'private-disk-path' }) });
  vi.stubGlobal('fetch', fixtures.fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('document vault context ownership', () => {
  it('never replaces the selected employee vault with a late previous employee read', async () => {
    let resolve!: (value: ReturnType<typeof vault>) => void;
    fixtures.api.get.mockReturnValueOnce(new Promise<ReturnType<typeof vault>>((done) => { resolve = done; })).mockResolvedValue(vault('Employee B degree.pdf'));
    const view = render(<DocumentVaultGrid mode="hr" userId="employee-a" />);
    view.rerender(<DocumentVaultGrid mode="hr" userId="employee-b" />);
    await screen.findByText('Employee B degree.pdf');
    await act(async () => { resolve(vault('Employee A confidential.pdf')); });
    expect(screen.queryByText('Employee A confidential.pdf')).not.toBeInTheDocument();
  });

  it('stops a staged upload before registration when the employee context changes', async () => {
    fixtures.api.get.mockResolvedValue(vault());
    let resolve!: (value: { ok: boolean; json: () => Promise<{ url: string }> }) => void;
    fixtures.fetch.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<DocumentVaultGrid mode="hr" userId="employee-a" />);
    await screen.findByText('Synthetic degree.pdf');
    fireEvent.change(screen.getByLabelText('Upload document'), { target: { files: [new File(['synthetic'], 'proof.pdf', { type: 'application/pdf' })] } });
    view.rerender(<DocumentVaultGrid mode="hr" userId="employee-b" />);
    await screen.findByText('Synthetic degree.pdf');
    await act(async () => { resolve({ ok: true, json: async () => ({ url: '/uploads/synthetic/old.pdf' }) }); });
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(fixtures.toast.success).not.toHaveBeenCalled();
  });

  it('locks the upload draft and reuses the canonical uploaded URL after registration fails', async () => {
    fixtures.api.get.mockResolvedValue(vault());
    let reject!: (error: Error) => void;
    fixtures.api.post.mockReturnValueOnce(new Promise((_done, fail) => { reject = fail; })).mockResolvedValue({});
    render(<DocumentVaultGrid mode="ess" />);
    await screen.findByText('Synthetic degree.pdf');
    fireEvent.change(screen.getByLabelText('Upload document'), { target: { files: [new File(['synthetic'], 'proof.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(fixtures.api.post).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByLabelText('Upload document')).toBeDisabled();
    await act(async () => { reject(new Error('Registration offline')); });
    fireEvent.click(screen.getByRole('button', { name: 'Retry document upload' }));
    await waitFor(() => expect(fixtures.toast.success).toHaveBeenCalledWith('Document uploaded'));
    expect(fixtures.fetch).toHaveBeenCalledTimes(1);
    expect(fixtures.api.post).toHaveBeenLastCalledWith('/api/hr/ess/documents', expect.objectContaining({ file_url: '/uploads/synthetic/proof.pdf' }));
  });

  it('keeps successful verification visible after refresh failure and prevents duplicate decisions', async () => {
    fixtures.api.get.mockResolvedValueOnce(vault()).mockRejectedValueOnce(new Error('Refresh offline'));
    let resolve!: () => void;
    fixtures.api.patch.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    render(<DocumentVaultGrid mode="hr" userId="employee-a" />);
    const button = await screen.findByRole('button', { name: 'Verify' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(fixtures.api.patch).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Changes saved, but documents could not be refreshed.');
    expect(screen.getByText('VERIFIED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument();
    expect(fixtures.toast.error).not.toHaveBeenCalled();
  });
});

describe('payslip account and request ownership', () => {
  it('does not display a previous account salary after its reads finish late', async () => {
    const pending: Array<(value: unknown[]) => void> = [];
    fixtures.api.get.mockImplementation(() => new Promise<unknown[]>((done) => pending.push(done)));
    const view = render(<MyPayslipsPanel />);
    fixtures.api = { get: vi.fn().mockImplementation(async (path: string) => path.endsWith('my-payslips') ? [month(200)] : []), post: vi.fn(), patch: vi.fn() };
    fixtures.auth = { user: { user_id: 'faculty-2', role: 'Faculty', roles: ['Faculty'] }, token: 'token-2' };
    view.rerender(<MyPayslipsPanel />);
    await screen.findByText('Net Rs.200');
    await act(async () => { pending[0]([month(100)]); pending[1]([]); });
    expect(screen.queryByText('Net Rs.100')).not.toBeInTheDocument();
  });

  it('keeps available approved requests when published salary history cannot be loaded', async () => {
    fixtures.api.get.mockImplementation((path: string) => path.endsWith('my-payslips') ? Promise.reject(new Error('Salary history offline')) : Promise.resolve([{ ...salaryRequest, status: 'APPROVED' }]));
    render(<MyPayslipsPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Published payslips: Salary history offline');
    expect(screen.getByText('Synthetic bank documentation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Payslips' })).toBeEnabled();
    expect(screen.queryByText(/No payslips published yet/)).not.toBeInTheDocument();
  });

  it('guards duplicate salary requests and preserves successful save after failed refresh', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('my-payslips') ? [month()] : []);
    let resolve!: (value: typeof salaryRequest) => void;
    fixtures.api.post.mockReturnValue(new Promise<typeof salaryRequest>((done) => { resolve = done; }));
    render(<MyPayslipsPanel />);
    await screen.findByText('Net Rs.100');
    const reason = screen.getByPlaceholderText(/Home loan documentation/);
    fireEvent.change(reason, { target: { value: '  Synthetic bank documentation  ' } });
    const form = reason.closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(fixtures.api.post).toHaveBeenCalledExactlyOnceWith('/api/hr/payslips/request-download', expect.objectContaining({ reason: 'Synthetic bank documentation' }));
    expect(reason).toBeDisabled(); expect(screen.getByLabelText('From month')).toBeDisabled();
    fixtures.api.get.mockRejectedValue(new Error('Refresh offline'));
    await act(async () => { resolve(salaryRequest); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Request saved, but payslip information could not be fully refreshed.');
    expect(screen.getByText('Pending HR approval')).toBeInTheDocument();
    expect(reason).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Submit to HR' })).toBeDisabled();
    expect(fixtures.toast.error).not.toHaveBeenCalled();
  });
});

describe('team approval tab ownership', () => {
  it('ignores a delayed previous tab and submits only the visible tab IDs', async () => {
    let resolveLeave!: (value: unknown) => void;
    let saved = false;
    fixtures.api.get.mockImplementation((path: string) => {
      if (path.includes('pending-counts')) return Promise.resolve(counts);
      if (path.includes('tab=LEAVE')) return new Promise((done) => { resolveLeave = done; });
      return Promise.resolve({ count: saved ? 0 : 1, tab: 'ON_DUTY', items: saved ? [] : [teamRow('od-1', 'On-duty employee', 'ON_DUTY')] });
    });
    fixtures.api.patch.mockImplementation(async () => { saved = true; return {}; });
    render(<TeamRequestsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'On Duty', exact: true }));
    await screen.findByText('On-duty employee');
    await act(async () => { resolveLeave({ count: 1, tab: 'LEAVE', items: [teamRow('leave-1', 'Wrong leave employee')] }); });
    expect(screen.queryByText('Wrong leave employee')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Bulk Approve' }));
    await waitFor(() => expect(fixtures.api.patch).toHaveBeenCalledWith('/api/hr/ess/team/requests/bulk', expect.objectContaining({ ids: ['od-1'], tab: 'ON_DUTY' })));
  });

  it('shows failed supplemental approval counts as unavailable and retries them', async () => {
    fixtures.auth.user = { user_id: 'hod-1', role: 'HOD', roles: ['HOD'] };
    let failed = true;
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.includes('pending-counts')) return counts;
      if (path.includes('funding-requests')) { if (failed) throw new Error('Funding counts offline'); return [{ request_id: 'fund-1', status: 'PENDING_HOD' }]; }
      if (path.includes('gate-passes')) return [];
      return { count: 0, tab: 'LEAVE', items: [] };
    });
    render(<TeamRequestsPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Funding counts offline');
    expect(screen.getByText('Pending in scope: Unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leaves (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Project Funding (Unavailable)' })).toBeInTheDocument();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Pending in scope: 3');
  });

  it('falls back to leaves when the selected funding tab is no longer permitted', async () => {
    fixtures.auth.user = { user_id: 'hod-1', role: 'HOD', roles: ['HOD'] };
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.includes('pending-counts')) return counts;
      if (path.includes('funding-requests')) return [{ request_id: 'fund-1', status: 'PENDING_HOD', faculty_name: 'Funding employee', amount: 100, project_title: 'Synthetic project' }];
      if (path.includes('gate-passes')) return [];
      return { count: 1, tab: 'LEAVE', items: [teamRow('leave-1', 'Leave employee')] };
    });
    const view = render(<TeamRequestsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Project Funding (1)' }));
    await screen.findByText('Funding employee');
    fixtures.auth.user = { ...fixtures.auth.user, role: 'Faculty', roles: ['Faculty'] };
    view.rerender(<TeamRequestsPanel />);
    await screen.findByText('Leave employee');
    expect(screen.queryByText('Funding employee')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Project Funding/ })).not.toBeInTheDocument();
    expect(fixtures.api.patch).not.toHaveBeenCalled();
  });

  it('locks tab and selection during a decision and ignores old-account completion', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => path.includes('pending-counts') ? counts : { count: 1, tab: 'LEAVE', items: [teamRow('leave-1', 'Old employee')] });
    let resolve!: () => void;
    const oldApi = fixtures.api;
    oldApi.patch.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    const view = render(<TeamRequestsPanel />);
    await screen.findByText('Old employee');
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    const approve = screen.getByRole('button', { name: 'Bulk Approve' });
    act(() => { fireEvent.click(approve); fireEvent.click(approve); });
    expect(oldApi.patch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'On Duty', exact: true })).toBeDisabled();
    expect(screen.getAllByRole('checkbox')[1]).toBeDisabled();
    fixtures.api = { get: vi.fn().mockImplementation(async (path: string) => path.includes('pending-counts') ? counts : { count: 1, tab: 'LEAVE', items: [teamRow('new-leave', 'New employee')] }), post: vi.fn(), patch: vi.fn() };
    fixtures.auth = { user: { user_id: 'faculty-2', role: 'Faculty', roles: ['Faculty'] }, token: 'token-2' };
    view.rerender(<TeamRequestsPanel />);
    await screen.findByText('New employee');
    await act(async () => { resolve(); });
    expect(screen.queryByText('Old employee')).not.toBeInTheDocument();
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(oldApi.get).toHaveBeenCalledTimes(2);
  });

  it('includes pending attendance overrides in the scoped total', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => path.includes('pending-counts')
      ? { ...counts, attendanceOverrides: 3 }
      : { count: 0, tab: 'LEAVE', items: [] });
    render(<TeamRequestsPanel />);
    await screen.findByText('Pending in scope: 5');
    expect(screen.getByRole('button', { name: 'Attendance (3)' })).toBeInTheDocument();
  });

  it('removes successful funding decisions and retries only failed requests after a partial batch', async () => {
    fixtures.auth.user = { user_id: 'hod-1', role: 'HOD', roles: ['HOD'] };
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.includes('pending-counts')) return counts;
      if (path.includes('funding-requests')) return [
        { request_id: 'fund-1', status: 'PENDING_HOD', faculty_name: 'Successful funding employee', amount: 100, project_title: 'Synthetic first project' },
        { request_id: 'fund-2', status: 'PENDING_HOD', faculty_name: 'Failed funding employee', amount: 200, project_title: 'Synthetic second project' },
      ];
      if (path.includes('gate-passes')) return [];
      return { count: 0, tab: 'LEAVE', items: [] };
    });
    fixtures.api.patch.mockImplementation(async (path: string) => { if (path.endsWith('/fund-2')) throw new Error('Synthetic rejection'); return {}; });
    render(<TeamRequestsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Project Funding (2)' }));
    await screen.findByText('Successful funding employee');
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Bulk Approve' }));
    await waitFor(() => expect(fixtures.toast.error).toHaveBeenCalledWith('1 funding decision(s) saved; 1 could not be saved. Retry the remaining requests.'));
    expect(screen.queryByText('Successful funding employee')).not.toBeInTheDocument();
    expect(screen.getByText('Failed funding employee')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bulk Approve' })).toBeEnabled());
    fixtures.api.patch.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Bulk Approve' }));
    await waitFor(() => expect(fixtures.api.patch).toHaveBeenCalledTimes(1));
    expect(fixtures.api.patch).toHaveBeenCalledWith('/api/academics/hod/funding-requests/fund-2', expect.any(Object));
  });
});
