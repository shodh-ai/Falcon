import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeclaredResultViewer, type DeclaredResultRow, type ResultViewerSession } from '../DeclaredResultViewer';

const fixtures = vi.hoisted(() => ({
  auth: { token: 'account-one-token' as string | null, user: { user_id: 'account-one', tenant_id: 'tenant-one', tenant_schema: 'sgvu' } as { user_id: string; tenant_id: string; tenant_schema: string } | null, isLoading: false },
  tenant: 'sgvu',
  fetch: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => fixtures.auth }));
vi.mock('@/lib/api/client', () => ({ getApiBaseUrl: () => 'http://localhost:4000', authHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }) }));
vi.mock('@/lib/tenant', () => ({ getSubdomainFromClient: () => fixtures.tenant }));

const session: ResultViewerSession = { session_id: 'session-one', course_code: 'SMOKE101', course_name: 'Data Engineering', exam_type: 'END_TERM', semester: 4, entry_status: 'LOCKED', marks_locked: true, declared_at: '2026-10-08T10:00:00Z', declaration_note: 'Published after official review.' };
const row: DeclaredResultRow = {
  report_id: 'report-one', session_id: session.session_id, student_user_id: 'student-one', student_name: 'First Student', enrollment_number: 'SGVU-2026-1001', course_code: 'SMOKE101', course_name: 'Data Engineering', semester: 4, exam_type: 'END_TERM', marks_obtained: 42, max_marks: 100, grade: 'C', result_status: 'PASS', session_declared_at: session.declared_at, declaration_note: session.declaration_note!, result_id: 'result-one', exam_session: 'Autumn 2026', canonical_marks_obtained: 42, canonical_max_marks: 100, canonical_grade: 'C', canonical_status: 'PUBLISHED', source_mark_id: 'mark-one', source_report_id: 'report-one', verification_status: 'verified', verification_message: 'Published result matches the declared student report and its source marks.',
};

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function expectReadsOnly() {
  for (const [url, init] of fixtures.fetch.mock.calls as [string, RequestInit][]) {
    expect(url).toMatch(/\/api\/exam-cell\/result-control\/sessions\/[^/]+\/reports$/);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.cache).toBe('no-store');
  }
}

beforeEach(() => {
  fixtures.auth = { token: 'account-one-token', user: { user_id: 'account-one', tenant_id: 'tenant-one', tenant_schema: 'sgvu' }, isLoading: false };
  fixtures.tenant = 'sgvu';
  fixtures.fetch.mockReset().mockResolvedValue(response([row]));
  vi.stubGlobal('fetch', fixtures.fetch);
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('DeclaredResultViewer read-only verification', () => {
  it('renders report and canonical values separately with the exact result references and declaration evidence', async () => {
    render(<DeclaredResultViewer session={session} />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('First Student')).toBeInTheDocument();
    expect(within(table).getByText('SGVU-2026-1001')).toBeInTheDocument();
    expect(within(table).getAllByText('42 / 100')).toHaveLength(2);
    expect(within(table).getByText('result-one')).toBeInTheDocument();
    expect(within(table).getByText('mark-one')).toBeInTheDocument();
    expect(within(table).getByText('Verified published source')).toBeInTheDocument();
    expect(screen.getByText('8 Oct 2026, 3:30 pm IST')).toBeInTheDocument();
    expect(screen.getByText('Published after official review.')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(fixtures.fetch).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('/session-one/reports'), expect.objectContaining({ headers: { Authorization: 'Bearer account-one-token', 'x-tenant-subdomain': 'sgvu' }, signal: expect.any(AbortSignal) }));
    expectReadsOnly();
  });

  it('searches the loaded records locally without fetching, creating, linking or publishing anything', async () => {
    fixtures.fetch.mockResolvedValue(response([row, { ...row, report_id: 'report-two', student_user_id: 'student-two', student_name: 'Second Student', enrollment_number: 'SGVU-2026-1002' }]));
    render(<DeclaredResultViewer session={session} />);
    await screen.findByText('Second Student');
    fireEvent.change(screen.getByRole('textbox', { name: 'Find student by name or enrollment ID' }), { target: { value: '1002' } });
    expect(screen.queryByText('First Student')).not.toBeInTheDocument();
    expect(screen.getByText('Second Student')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'missing' } });
    expect(screen.getByText('No reports match this student search.')).toBeInTheDocument();
    expect(fixtures.fetch).toHaveBeenCalledTimes(1);
    expectReadsOnly();
  });

  it('preserves a genuine zero rather than treating it as missing marks', async () => {
    fixtures.fetch.mockResolvedValue(response([{ ...row, marks_obtained: 0, canonical_marks_obtained: 0, grade: null, canonical_grade: null }]));
    render(<DeclaredResultViewer session={session} />);
    const table = await screen.findByRole('table');
    expect(within(table).getAllByText('0 / 100')).toHaveLength(2);
    expectReadsOnly();
  });

  it('does not infer an official student result from a declared session with no reports', async () => {
    fixtures.fetch.mockResolvedValue(response([]));
    render(<DeclaredResultViewer session={{ ...session, declaration_note: 'SMOKE: QA walkthrough.' }} />);
    await screen.findByText(/No declared student reports exist for this session/);
    expect(screen.getByText('SMOKE: QA walkthrough.')).toBeInTheDocument();
    expect(screen.getByText(/A declared session alone does not verify/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expectReadsOnly();
  });

  it.each([
    ['qa', 'QA / demo source', 'QA seeded result; not official evidence.'],
    ['unverified', 'Unverified source', 'No matching published exam result exists.'],
  ] as const)('clearly labels %s records while preserving the returned marks', async (status, label, message) => {
    fixtures.fetch.mockResolvedValue(response([{ ...row, verification_status: status, verification_message: message, result_id: null, canonical_marks_obtained: null, canonical_max_marks: null, marks_obtained: 48 }]));
    render(<DeclaredResultViewer session={session} />);
    await screen.findByText(label);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText('48 / 100')).toBeInTheDocument();
    expect(screen.getByText('No matching published result')).toBeInTheDocument();
    expect(screen.queryByText('Verified published source')).not.toBeInTheDocument();
    expectReadsOnly();
  });

  it('retries a failed read using only GET and never substitutes development data', async () => {
    fixtures.fetch.mockRejectedValueOnce(new TypeError('Network unavailable')).mockResolvedValueOnce(response([row]));
    render(<DeclaredResultViewer session={session} />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry student reports' }));
    await screen.findByText('First Student');
    expect(fixtures.fetch).toHaveBeenCalledTimes(2);
    expectReadsOnly();
  });

  it.each([401, 403])('shows an authorization error for HTTP %i without accepting report data', async (status) => {
    fixtures.fetch.mockResolvedValue(response([row], status));
    render(<DeclaredResultViewer session={session} />);
    await screen.findByText('Your account is not authorized to view these student reports.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expectReadsOnly();
  });

  it.each([
    { body: { session_id: 'fake-session' } },
    { body: [{ ...row, session_id: 'another-session' }] },
    { body: [{ ...row, exam_type: null }] },
    { body: [{ ...row, course_code: null }] },
    { body: [{ ...row, student_user_id: null }] },
    { body: [{ ...row, verification_status: 'unknown' }] },
  ])('rejects a fallback, malformed report or response belonging to another session', async ({ body }) => {
    fixtures.fetch.mockResolvedValue(response(body));
    render(<DeclaredResultViewer session={session} />);
    await screen.findByText(/The report response does not match this session/);
    expect(screen.queryByText('First Student')).not.toBeInTheDocument();
    expectReadsOnly();
  });

  it('aborts an old session read and ignores its delayed response after another session is selected', async () => {
    const old = pending<Response>();
    fixtures.fetch.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response([{ ...row, session_id: 'session-two', student_name: 'Current Student' }]));
    const { rerender } = render(<DeclaredResultViewer session={session} />);
    await waitFor(() => expect(fixtures.fetch).toHaveBeenCalledTimes(1));
    const signal = fixtures.fetch.mock.calls[0][1].signal as AbortSignal;
    rerender(<DeclaredResultViewer session={{ ...session, session_id: 'session-two' }} />);
    expect(signal.aborted).toBe(true);
    await screen.findByText('Current Student');
    await act(async () => { old.resolve(response([row])); });
    expect(screen.queryByText('First Student')).not.toBeInTheDocument();
    expect(screen.getByText('Current Student')).toBeInTheDocument();
    expectReadsOnly();
  });

  it.each(['account', 'token', 'tenant'])('clears old rows and cancels requests when the %s changes', async (change) => {
    const current = pending<Response>();
    fixtures.fetch.mockResolvedValueOnce(response([row])).mockReturnValueOnce(current.promise);
    const { rerender } = render(<DeclaredResultViewer session={session} />);
    await screen.findByText('First Student');
    const oldSignal = fixtures.fetch.mock.calls[0][1].signal as AbortSignal;
    if (change === 'account') fixtures.auth.user = { user_id: 'account-two', tenant_id: 'tenant-one', tenant_schema: 'sgvu' };
    if (change === 'token') fixtures.auth.token = 'account-two-token';
    if (change === 'tenant') fixtures.tenant = 'other-campus';
    rerender(<DeclaredResultViewer session={session} />);
    expect(screen.queryByText('First Student')).not.toBeInTheDocument();
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { current.resolve(response([])); });
    await screen.findByText(/No declared student reports exist/);
    expectReadsOnly();
  });

  it('does not fetch without an existing session or an authenticated account and hides records on logout', async () => {
    const { rerender } = render(<DeclaredResultViewer session={null} />);
    expect(fixtures.fetch).not.toHaveBeenCalled();
    rerender(<DeclaredResultViewer session={session} />);
    await screen.findByText('First Student');
    fixtures.auth.token = null;
    fixtures.auth.user = null;
    rerender(<DeclaredResultViewer session={session} />);
    expect(screen.queryByText('First Student')).not.toBeInTheDocument();
    expect(screen.getByText(/Sign in with an authorized Exam Cell account/)).toBeInTheDocument();
    expect(fixtures.fetch).toHaveBeenCalledTimes(1);
    expectReadsOnly();
  });
});
