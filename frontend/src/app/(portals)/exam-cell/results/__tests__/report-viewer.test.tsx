import type { SelectHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExamCellResultsPage from '../page';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  auth: { token: 'first-token' as string | null, user: { user_id: 'first-account', tenant_id: 'first-tenant', tenant_schema: 'sgvu' } as { user_id: string; tenant_id: string; tenant_schema: string } | null, isLoading: false },
  tenant: 'sgvu',
  fetch: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => fixtures.auth }));
vi.mock('@/lib/api/client', () => ({ getApiBaseUrl: () => 'http://localhost:4000', authHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }) }));
vi.mock('@/lib/tenant', () => ({ getSubdomainFromClient: () => fixtures.tenant }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));

const originalScrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

const firstSession = {
  session_id: 'first-session', course_id: 'first-course', course_code: 'SMOKE101', course_name: 'First course', exam_type: 'END_TERM', semester: 4,
  max_marks: 100, pass_marks: 40, entry_status: 'LOCKED', marks_locked: true, declared_at: '2026-10-08T09:01:00Z', declaration_note: 'First account declaration note',
  processed_at: '2026-10-07T09:01:00Z', pending_coe_count: 0, report_count: 1, grading_policy_id: null,
};
const secondSession = { ...firstSession, session_id: 'second-session', course_id: 'second-course', course_code: 'COURSE202', course_name: 'Second course', exam_type: 'CAT2', declaration_note: 'Second session declaration note' };

function report(session = firstSession, studentName = 'First account student') {
  return {
    report_id: `${session.session_id}-report`, session_id: session.session_id, student_user_id: `${session.session_id}-student`, student_name: studentName,
    enrollment_number: 'SGVU-2026-1001', course_code: session.course_code, course_name: session.course_name, semester: session.semester, exam_type: session.exam_type,
    marks_obtained: 42, max_marks: 100, grade: 'C', result_status: 'PASS', session_declared_at: session.declared_at, declaration_note: session.declaration_note,
    result_id: null, exam_session: null, canonical_marks_obtained: null, canonical_max_marks: null, canonical_grade: null, canonical_status: null,
    source_mark_id: null, source_report_id: null, verification_status: 'unverified', verification_message: 'No matching published result exists.',
  };
}

function response(body: unknown) { return { ok: true, status: 200, json: async () => body } as Response; }

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function mockPageReads(sessions = [firstSession, secondSession]) {
  fixtures.api.get.mockImplementation(async (path: string) => {
    if (path === '/api/exam-cell/result-control/sessions') return sessions;
    if (path.startsWith('/api/exam-cell/result-control/sessions/')) return sessions.find((session) => path.endsWith(session.session_id));
    return [];
  });
}

function expectNoWrites() {
  expect(fixtures.api.post).not.toHaveBeenCalled();
  expect(fixtures.api.patch).not.toHaveBeenCalled();
  expect(fixtures.api.del).not.toHaveBeenCalled();
  for (const [url, options] of fixtures.fetch.mock.calls as [string, RequestInit][]) {
    expect(url).toMatch(/\/result-control\/sessions\/[^/]+\/reports$/);
    expect(options.method).toBe('GET');
    expect(options.body).toBeUndefined();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.auth = { token: 'first-token', user: { user_id: 'first-account', tenant_id: 'first-tenant', tenant_schema: 'sgvu' }, isLoading: false };
  fixtures.tenant = 'sgvu';
  mockPageReads();
  fixtures.fetch.mockReset().mockImplementation(async (url: string) => response([report(url.includes('second-session') ? secondSession : firstSession)]));
  vi.stubGlobal('fetch', fixtures.fetch);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  if (originalScrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
});

describe('Result Control Centre report viewer integration', () => {
  it('opens existing sessions and searches their reports through GET requests only', async () => {
    render(<ExamCellResultsPage />);
    const firstButton = await screen.findByRole('button', { name: /SMOKE101 · END_TERM/ });
    expect(screen.getByText('Select an existing session above to review its student reports.')).toBeInTheDocument();
    expect(fixtures.fetch).not.toHaveBeenCalled();

    fireEvent.click(firstButton);
    await screen.findByRole('table');
    expect(screen.getByText('First account declaration note')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find student by name or enrollment ID' }), { target: { value: 'missing' } });
    expect(screen.getByText('No reports match this student search.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /COURSE202 · CAT2/ }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('COURSE202 · CAT2')).toBeInTheDocument();
    expect(screen.getByText('Second session declaration note')).toBeInTheDocument();
    expect(screen.queryByText('First account declaration note')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Find student by name or enrollment ID' })).toHaveValue('');
    expect(fixtures.api.get.mock.calls.filter(([path]) => path === '/api/exam-cell/result-control/sessions')).toHaveLength(1);
    expect(fixtures.fetch).toHaveBeenCalledTimes(2);
    expectNoWrites();
  });

  it('discards the selected session, its metadata and late report responses when the account changes', async () => {
    const oldRead = pending<Response>();
    fixtures.fetch.mockReturnValueOnce(oldRead.promise);
    const { rerender } = render(<ExamCellResultsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /SMOKE101 · END_TERM/ }));
    await waitFor(() => expect(fixtures.fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByText('First account declaration note')).toBeInTheDocument();
    const oldSignal = fixtures.fetch.mock.calls[0][1].signal as AbortSignal;

    const newSession = { ...secondSession, declaration_note: 'Current account declaration note' };
    mockPageReads([newSession]);
    fixtures.auth = { token: 'second-token', user: { user_id: 'second-account', tenant_id: 'second-tenant', tenant_schema: 'other' }, isLoading: false };
    fixtures.tenant = 'other';
    fixtures.fetch.mockImplementation(async () => response([report(newSession, 'Current account student')]));
    rerender(<ExamCellResultsPage />);

    expect(screen.queryByText('First account declaration note')).not.toBeInTheDocument();
    expect(screen.queryByText('first-session')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /SMOKE101 · END_TERM/ })).not.toBeInTheDocument();
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { oldRead.resolve(response([report()])); });
    expect(screen.queryByText('First account student')).not.toBeInTheDocument();
    expect(screen.getByText('Select an existing session above to review its student reports.')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /COURSE202 · CAT2/ }));
    await screen.findByText('Current account student');
    expect(screen.getByText('Current account declaration note')).toBeInTheDocument();
    expect(fixtures.fetch.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer second-token', 'x-tenant-subdomain': 'other' });
    expect(screen.queryByText('First account declaration note')).not.toBeInTheDocument();
    expectNoWrites();
  });
});
