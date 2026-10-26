import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApprovalsPage from '@/app/(portals)/exam-cell/hall-ticket-approvals/page';
import AdmitCardsPage from '@/app/(portals)/exam-cell/admit-cards/page';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  user: { user_id: 'test-actor', tenant_id: 'test-tenant', role: 'ExamCell', primaryRole: 'ExamCell', roles: ['ExamCell'] },
  error: vi.fn(), success: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, ...props }: ComponentProps<'select'>) => <select {...props}>{children}</select>,
}));

const workflow = {
  status: 'BLOCKED', code: 'HALL_TICKET_POLICY_UNCONFIRMED',
  can_sync: false, can_approve: false, can_issue: false,
  message: 'Stage permissions and issuance policy need senior confirmation.',
};
const approval = {
  approval_id: 'fixture', student_name: 'Synthetic Student', enrollment_number: 'TEST-001',
  student_user_id: 'student-id',
  stage: 'FINANCE', eligibility_status: 'APPROVED', finance_status: 'PENDING',
  exam_office_status: 'PENDING', coe_status: 'PENDING', block_reasons: [],
};
const session = { session_id: 'session-id', session_name: 'Verified session', semester: 4, status: 'OPEN' };
const audit = {
  workflow, eligible_count: 1, blocked_count: 0, semester: 4,
  items: [{ student_user_id: 'fixture', name: 'Synthetic Student', student_id: 'TEST-001',
    semester: 4, fee_status: 'Clear', attendance_percent: 85, has_exemption: false, eligible: true, block_reasons: [] }],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.user_id = 'test-actor';
  mocks.user.tenant_id = 'test-tenant';
  mocks.user.role = 'ExamCell';
  mocks.user.primaryRole = 'ExamCell';
  mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/sessions' ? [session] : path.includes('/admit-cards/audit') ? audit : { data: [approval], workflow });
});

describe('Hall Ticket policy-dependent operations remain visibly fail-closed', () => {
  it('preserves readable approvals but blocks individual, bulk and sync buttons', async () => {
    render(<ApprovalsPage />);
    await screen.findByText('Synthetic Student');
    expect(screen.getByText(workflow.message)).toBeVisible();
    for (const label of ['Advance current stage', 'Reject', 'Prepare approval queue', 'Bulk advance current stage']) {
      const button = screen.getByRole('button', { name: label, exact: true });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it('does not show approval actions for active ExamOperator even with a secondary ExamCell role', async () => {
    mocks.user.primaryRole = 'ExamOperator';
    render(<ApprovalsPage />);
    await screen.findByText('Synthetic Student');
    expect(screen.queryByRole('button', { name: 'Advance current stage', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bulk advance current stage' })).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });
  it('never authorizes mutation from an older queue response without workflow metadata', async () => {
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/sessions' ? [session] : [approval]);
    render(<ApprovalsPage />);
    await screen.findByText('Synthetic Student');
    expect(screen.getByRole('button', { name: 'Advance current stage', exact: true })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('workflow is unavailable');
  });
  it('shows queue errors as errors, supports retry, and never displays false success', async () => {
    let failed = false;
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/exam-cell/sessions') return [session];
      if (!failed) { failed = true; throw new Error('Queue unavailable'); }
      return { data: [approval], workflow };
    });
    render(<ApprovalsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Queue unavailable');
    expect(screen.queryByText(/No approval records found/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading approvals' }));
    await screen.findByText('Synthetic Student');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });
  it('prepares only the selected session and never sends a guessed semester/batch or approval stage', async () => {
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/sessions' ? [session] : { data: [approval], workflow: { ...workflow, can_sync: path.includes('session_id=') } });
    mocks.api.post.mockResolvedValue({ synced: 1, total: 1 });
    render(<ApprovalsPage />);
    await screen.findByText('Synthetic Student');
    expect(screen.getByRole('button', { name: 'Prepare approval queue' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Examination session'), { target: { value: session.session_id } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Prepare approval queue' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Prepare approval queue' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/exam-cell/hall-ticket-approvals/sync', { session_id: session.session_id }));
    expect(mocks.api.get).toHaveBeenCalledWith(expect.stringContaining('hall-ticket-approvals?session_id=session-id'));
    expect(screen.getByRole('button', { name: 'Advance current stage', exact: true })).toBeDisabled();
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('No stage was approved and no ticket was issued')));
  });
  it('checks exact linked requirements without confusing diagnostics with issuance', async () => {
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/sessions' ? [session] : path.includes('/admit-cards/audit') ? {
      session_id: session.session_id, registration_id: 'registration-id', student_user_id: approval.student_user_id,
      diagnostic_only: true, ready_to_issue: false, block_reasons: ['Missing own seating'], unresolved_requirements: ['Internal assessment rules unverified'],
    } : { data: [{ ...approval, session_id: session.session_id, registration_id: 'registration-id' }], workflow });
    render(<ApprovalsPage />);
    await screen.findByText('Synthetic Student');
    fireEvent.click(screen.getByRole('button', { name: 'Check requirements' }));
    await screen.findByText('Missing own seating');
    expect(screen.getByText('Internal assessment rules unverified')).toBeVisible();
    expect(mocks.api.get).toHaveBeenCalledWith('/api/exam-cell/admit-cards/audit?session_id=session-id&registration_id=registration-id');
    expect(mocks.api.post).not.toHaveBeenCalled();
  });
  it('does not turn preparation errors into success messages', async () => {
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/sessions' ? [session] : { data: [approval], workflow: { ...workflow, can_sync: true } });
    mocks.api.post.mockRejectedValue(new Error('Registration changed'));
    render(<ApprovalsPage />);
    await screen.findByText('Synthetic Student');
    fireEvent.change(screen.getByLabelText('Examination session'), { target: { value: session.session_id } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Prepare approval queue' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Prepare approval queue' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Registration changed'));
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('keeps blocked approval flags authoritative and never sends a bulk target-stage request', async () => {
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/sessions' ? [session] : {
      data: [{ ...approval, session_id: session.session_id, registration_id: 'registration-id' }],
      workflow: { ...workflow, can_approve: true },
    });
    render(<ApprovalsPage />);
    await screen.findByText('Synthetic Student');
    fireEvent.change(screen.getByLabelText('Examination session'), { target: { value: session.session_id } });
    await screen.findByText('Synthetic Student');
    const bulk = screen.getByRole('button', { name: 'Bulk advance current stage' });
    expect(bulk).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Advance current stage', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject', exact: true })).toBeDisabled();
    expect(screen.getByText(/Bulk actions apply only to the displayed linked pending records/)).toBeVisible();
    fireEvent.click(bulk);
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it.each([
    { session_id: 'another-session', registration_id: 'registration-id', student_user_id: approval.student_user_id },
    { session_id: session.session_id, registration_id: 'another-registration', student_user_id: approval.student_user_id },
    { session_id: session.session_id, registration_id: 'registration-id', student_user_id: 'another-student' },
    { session_id: session.session_id, registration_id: 'registration-id', student_user_id: approval.student_user_id, ready_to_issue: true },
    { session_id: session.session_id, registration_id: 'registration-id', student_user_id: approval.student_user_id, diagnostic_only: false },
    { session_id: session.session_id, registration_id: 'registration-id', student_user_id: approval.student_user_id, block_reasons: [''] },
  ])('rejects mismatched or non-diagnostic approval readiness without revealing returned reasons %p', async (overrides) => {
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/sessions' ? [session] : path.includes('/admit-cards/audit') ? {
      session_id: session.session_id, registration_id: 'registration-id', student_user_id: approval.student_user_id,
      diagnostic_only: true, ready_to_issue: false, block_reasons: ['Unverified response details'], unresolved_requirements: [], ...overrides,
    } : { data: [{ ...approval, session_id: session.session_id, registration_id: 'registration-id' }], workflow });
    render(<ApprovalsPage />);
    await screen.findByText('Synthetic Student');
    fireEvent.click(screen.getByRole('button', { name: 'Check requirements' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Readiness response could not be verified for this registration');
    expect(screen.queryByText('Unverified response details')).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('does not restore late approval readiness after selecting another session', async () => {
    let resolveDiagnostic!: (value: unknown) => void;
    mocks.api.get.mockImplementation((path: string) => {
      if (path === '/api/exam-cell/sessions') return Promise.resolve([session]);
      if (path.includes('/admit-cards/audit')) return new Promise((resolve) => { resolveDiagnostic = resolve; });
      return Promise.resolve({ data: [{ ...approval, session_id: session.session_id, registration_id: 'registration-id' }], workflow });
    });
    render(<ApprovalsPage />);
    await screen.findByText('Synthetic Student');
    fireEvent.click(screen.getByRole('button', { name: 'Check requirements' }));
    fireEvent.change(screen.getByLabelText('Examination session'), { target: { value: session.session_id } });
    await screen.findByText('Synthetic Student');
    await act(async () => { resolveDiagnostic({
      session_id: session.session_id, registration_id: 'registration-id', student_user_id: approval.student_user_id,
      diagnostic_only: true, ready_to_issue: false, block_reasons: ['Stale diagnostic details'], unresolved_requirements: [],
    }); });
    expect(screen.queryByText('Stale diagnostic details')).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('hides prior approval records when the authenticated tenant changes', async () => {
    const view = render(<ApprovalsPage />);
    await screen.findByText('Synthetic Student');
    mocks.user.tenant_id = 'another-tenant';
    mocks.api.get.mockReturnValue(new Promise(() => {}));
    view.rerender(<ApprovalsPage />);
    expect(screen.queryByText('Synthetic Student')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Verified session/ })).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });
});

const linkedApproval = {
  ...approval, registration_id: 'registration-id', session_id: session.session_id,
  student_user_id: 'student-id',
};
const diagnostic = {
  session_id: session.session_id, registration_id: linkedApproval.registration_id,
  student_user_id: linkedApproval.student_user_id,
  diagnostic_only: true, ready_to_issue: false,
  block_reasons: ['Own seating allocation is missing'],
  unresolved_requirements: ['Eligibility approver role is unconfirmed'],
};
const nextSession = { ...session, session_id: 'second-session', session_name: 'Second verified session' };

function mockSessionReadiness(overrides: { queue?: unknown; sessions?: unknown; diagnostic?: unknown } = {}) {
  mocks.api.get.mockImplementation(async (path: string) => {
    if (path === '/api/exam-cell/sessions') return overrides.sessions ?? [session, nextSession];
    if (path.startsWith('/api/exam-cell/hall-ticket-approvals?')) {
      return overrides.queue ?? { data: [linkedApproval], total: 1, workflow };
    }
    if (path.startsWith('/api/exam-cell/admit-cards/audit?')) return overrides.diagnostic ?? diagnostic;
    throw new Error('Unexpected test request: ' + path);
  });
}

async function selectReadinessSession(id = session.session_id) {
  await screen.findByRole('option', { name: /Verified session · Semester 4/ });
  fireEvent.change(screen.getByLabelText('Examination session'), { target: { value: id } });
}

describe('Hall Ticket readiness uses actual session and registration records', () => {
  it('waits for an explicit session and never uses guessed semester or batch labels', async () => {
    mockSessionReadiness();
    render(<AdmitCardsPage />);
    await screen.findByRole('option', { name: /Verified session · Semester 4/ });
    expect(mocks.api.get).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Issue Hall Tickets — unavailable' })).toBeDisabled();
    expect(screen.queryByText('Synthetic Student')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hall Ticket Approval Workflow →' })).toHaveAttribute('href', '/exam-cell/hall-ticket-approvals');
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('checks only the selected session and exact linked registration without issuing', async () => {
    mockSessionReadiness();
    render(<AdmitCardsPage />);
    await selectReadinessSession();
    await screen.findByText('Synthetic Student');
    expect(mocks.api.get).toHaveBeenCalledWith('/api/exam-cell/hall-ticket-approvals?session_id=session-id&page=1&limit=50');
    fireEvent.click(screen.getByRole('button', { name: 'Check readiness' }));
    await screen.findByText('Own seating allocation is missing');
    expect(mocks.api.get).toHaveBeenCalledWith('/api/exam-cell/admit-cards/audit?session_id=session-id&registration_id=registration-id');
    expect(screen.getByText('Eligibility approver role is unconfirmed')).toBeVisible();
    expect(screen.getByText('Issuance blocked')).toBeVisible();
    expect(screen.queryByText('Ready for issuance')).not.toBeInTheDocument();
    expect(screen.queryByText('Issued')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Issue Hall Tickets — unavailable' }));
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(mocks.api.get.mock.calls.every(([path]) => !String(path).includes('batch_label='))).toBe(true);
  });

  it('does not turn empty diagnostic blockers or a permissive legacy flag into issuance authorization', async () => {
    mockSessionReadiness({
      queue: { data: [linkedApproval], total: 1, workflow: { ...workflow, can_issue: true } },
      diagnostic: { ...diagnostic, block_reasons: [] },
    });
    render(<AdmitCardsPage />);
    await selectReadinessSession();
    fireEvent.click(await screen.findByRole('button', { name: 'Check readiness' }));
    await screen.findByText(/No additional diagnostic blockers were reported/);
    expect(screen.getByRole('button', { name: 'Issue Hall Tickets — unavailable' })).toBeDisabled();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('shows session loading and a genuine empty session response separately', async () => {
    let resolveSessions!: (value: unknown) => void;
    mocks.api.get.mockReturnValue(new Promise((resolve) => { resolveSessions = resolve; }));
    render(<AdmitCardsPage />);
    expect(screen.getByRole('option', { name: 'Loading sessions…' })).toBeInTheDocument();
    expect(screen.queryByText('No examination sessions are available.')).not.toBeInTheDocument();
    await act(async () => { resolveSessions([]); });
    expect(await screen.findByText('No examination sessions are available.')).toBeVisible();
    expect(mocks.api.get).toHaveBeenCalledTimes(1);
  });

  it('reports session API failure and retries without a fabricated empty response', async () => {
    mockSessionReadiness();
    mocks.api.get.mockRejectedValueOnce(new Error('Session service unavailable'));
    render(<AdmitCardsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Session service unavailable');
    expect(screen.queryByText('No examination sessions are available.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }));
    await screen.findByRole('option', { name: /Verified session · Semester 4/ });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('shows a genuine empty queue without claiming there are no eligible students', async () => {
    mockSessionReadiness({ queue: { data: [], total: 0, workflow } });
    render(<AdmitCardsPage />);
    await selectReadinessSession();
    expect(await screen.findByText(/No linked approval records for this session/)).toBeVisible();
    expect(screen.queryByText(/No enrolled students/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check readiness' })).not.toBeInTheDocument();
  });

  it('shows forbidden queue access as an error and can retry the exact session', async () => {
    let attempts = 0;
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/exam-cell/sessions') return [session];
      if (++attempts === 1) throw new Error('Forbidden: tenant access denied');
      return { data: [linkedApproval], total: 1, workflow };
    });
    render(<AdmitCardsPage />);
    await selectReadinessSession();
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden: tenant access denied');
    expect(screen.queryByText(/No linked approval records for this session/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }));
    await screen.findByText('Synthetic Student');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it.each([
    [linkedApproval],
    { data: [linkedApproval], total: -1 },
    { data: [{ ...linkedApproval, session_id: nextSession.session_id }], total: 1 },
    { data: [{ ...linkedApproval, registration_id: undefined }], total: 1 },
  ])('fails closed on malformed or wrong-session approval response %p', async (queue) => {
    mockSessionReadiness({ queue });
    render(<AdmitCardsPage />);
    await selectReadinessSession();
    expect(await screen.findByRole('alert')).toHaveTextContent('Session-linked approval records could not be verified');
    expect(screen.queryByText('Synthetic Student')).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('keeps legacy unlinked records readable but never inspects them as approved registrations', async () => {
    mockSessionReadiness({ queue: { data: [{ ...linkedApproval, registration_id: null }], total: 1, workflow } });
    render(<AdmitCardsPage />);
    await selectReadinessSession();
    await screen.findByText('Synthetic Student');
    expect(screen.getByText('Unlinked — unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check readiness' })).toBeDisabled();
    expect(mocks.api.get.mock.calls.some(([path]) => String(path).includes('/admit-cards/audit'))).toBe(false);
  });

  it.each([
    { ...diagnostic, session_id: nextSession.session_id },
    { ...diagnostic, student_user_id: 'another-student' },
    { ...diagnostic, registration_id: 'another-registration' },
    { ...diagnostic, ready_to_issue: true },
    { ...diagnostic, diagnostic_only: false },
    { ...diagnostic, block_reasons: null },
  ])('rejects unverifiable or mismatched readiness %p', async (response) => {
    mockSessionReadiness({ diagnostic: response });
    render(<AdmitCardsPage />);
    await selectReadinessSession();
    fireEvent.click(await screen.findByRole('button', { name: 'Check readiness' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Readiness response could not be verified for this registration');
    expect(screen.queryByText('Own seating allocation is missing')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Issue Hall Tickets — unavailable' })).toBeDisabled();
  });

  it('reports an unavailable diagnostic and allows retry without generation', async () => {
    mockSessionReadiness();
    render(<AdmitCardsPage />);
    await selectReadinessSession();
    const check = await screen.findByRole('button', { name: 'Check readiness' });
    mocks.api.get.mockRejectedValueOnce(new Error('Finance unavailable'));
    fireEvent.click(check);
    expect(await screen.findByRole('alert')).toHaveTextContent('Finance unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Check readiness' }));
    await screen.findByText('Own seating allocation is missing');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('does not display a late queue response after selecting another session', async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.api.get.mockImplementation((path: string) => {
      if (path === '/api/exam-cell/sessions') return Promise.resolve([session, nextSession]);
      if (path.includes('session_id=session-id')) return new Promise((resolve) => { resolveOld = resolve; });
      return Promise.resolve({ data: [], total: 0, workflow });
    });
    render(<AdmitCardsPage />);
    await selectReadinessSession();
    await waitFor(() => expect(mocks.api.get).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText('Examination session'), { target: { value: nextSession.session_id } });
    await screen.findByText(/No linked approval records for this session/);
    await act(async () => { resolveOld({ data: [linkedApproval], total: 1, workflow }); });
    expect(screen.queryByText('Synthetic Student')).not.toBeInTheDocument();
  });

  it('does not display a late diagnostic after selecting another session', async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.api.get.mockImplementation((path: string) => {
      if (path === '/api/exam-cell/sessions') return Promise.resolve([session, nextSession]);
      if (path.includes('/admit-cards/audit')) return new Promise((resolve) => { resolveOld = resolve; });
      return Promise.resolve(path.includes('session_id=session-id') ? { data: [linkedApproval], total: 1, workflow } : { data: [], total: 0, workflow });
    });
    render(<AdmitCardsPage />);
    await selectReadinessSession();
    fireEvent.click(await screen.findByRole('button', { name: 'Check readiness' }));
    await screen.findByText('Checking current authoritative records…');
    fireEvent.change(screen.getByLabelText('Examination session'), { target: { value: nextSession.session_id } });
    await screen.findByText(/No linked approval records for this session/);
    await act(async () => { resolveOld(diagnostic); });
    expect(screen.queryByText('Own seating allocation is missing')).not.toBeInTheDocument();
    expect(screen.queryByText('Readiness — Synthetic Student')).not.toBeInTheDocument();
  });

  it('hides tenant-scoped data immediately when the authenticated tenant changes', async () => {
    mockSessionReadiness();
    const view = render(<AdmitCardsPage />);
    await selectReadinessSession();
    await screen.findByText('Synthetic Student');
    mocks.user.tenant_id = 'another-tenant';
    mocks.api.get.mockReturnValue(new Promise(() => {}));
    view.rerender(<AdmitCardsPage />);
    expect(screen.queryByText('Synthetic Student')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Verified session/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Examination session')).toBeDisabled();
  });

  it('does not restore a late session response after the active role loses access', async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.api.get.mockReturnValue(new Promise((resolve) => { resolveOld = resolve; }));
    const view = render(<AdmitCardsPage />);
    mocks.user.primaryRole = 'Student';
    view.rerender(<AdmitCardsPage />);
    await act(async () => { resolveOld([session]); });
    expect(screen.getByRole('alert')).toHaveTextContent('Your active role cannot access Hall Ticket readiness.');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(mocks.api.get).toHaveBeenCalledTimes(1);
  });

  it('does not fetch with missing tenant identity or borrow a secondary role', () => {
    mocks.user.tenant_id = '';
    const view = render(<AdmitCardsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Authenticated tenant and user context is unavailable');
    expect(mocks.api.get).not.toHaveBeenCalled();
    mocks.user.tenant_id = 'test-tenant';
    mocks.user.primaryRole = 'Student';
    view.rerender(<AdmitCardsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your active role cannot access Hall Ticket readiness.');
    expect(mocks.api.get).not.toHaveBeenCalled();
  });

  it('paginates the real queue instead of silently truncating linked registrations', async () => {
    mockSessionReadiness({ queue: { data: [linkedApproval], total: 51, workflow } });
    render(<AdmitCardsPage />);
    await selectReadinessSession();
    await screen.findByText('Synthetic Student');
    fireEvent.click(screen.getByRole('button', { name: 'Next', exact: true }));
    await waitFor(() => expect(mocks.api.get).toHaveBeenCalledWith('/api/exam-cell/hall-ticket-approvals?session_id=session-id&page=2&limit=50'));
    await screen.findByText('Page 2 of 2');
    expect(screen.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous', exact: true })).toBeEnabled();
  });
});
