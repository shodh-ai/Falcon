import type { ReactNode, SelectHTMLAttributes } from 'react';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamCellDashboardPage from '@/app/(portals)/exam-cell/dashboard/page';
import { PIPELINE_ICONS, ResultPublishingPipeline, type PipelineStep } from '@/components/exam-cell/ResultPublishingPipeline';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  chartData: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
// Exercise dashboard selection, not Radix's pointer/layout implementation in jsdom.
vi.mock('@/components/ui/select', () => ({
  Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ data, children }: { data: unknown; children: ReactNode }) => {
    mocks.chartData(data);
    return <div>{children}</div>;
  },
  Bar: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));

const SUMMARY = '/api/exam-cell/dashboard';
const TODAY = '/api/exam-cell/exam-day/today';
const SESSIONS = '/api/exam-cell/result-control/sessions';
const session = {
  session_id: 'session-a', course_code: 'TEST-101', course_name: 'Test course A',
  exam_type: 'END_SEM', semester: 2, entry_status: 'LOCKED', marks_locked: true,
  declared_at: null,
};
const detail = { ...session, coe_audit_status: 'passed', dean_approved: false, dean_approval_status: 'PENDING' };
const secondSession = { ...session, session_id: 'session-b', course_code: 'TEST-201', course_name: 'Test course B' };
const summary = {
  todays_exams: 2, active_exam_sessions: 3, pending_results: 4, re_evaluations_queue: 5,
  pending_coe_marks: 6, pending_hall_tickets: 7, open_ufm_cases: 8,
  upcoming_exams: 9, registered_students: 120, students_eligible: 110,
  hall_tickets_generated: 100, todays_attendance: 90, form_registrations: 80,
  pending_supplementary: 10, invigilators_assigned_today: 11,
  result_status_chart: [{ label: 'FAIL', count: 1 }, { label: 'PASS', count: 6 }],
  recent_activity: [{ audit_id: 'audit-a', action: 'RESULT_SESSION_CREATED', resource_type: 'exam_result_session', actor_name: 'Test operator', created_at: '2026-10-19T09:00:00Z' }],
};
const today = [{
  exam_schedule_id: 'exam-a', exam_type: 'END_SEM', exam_date: '2026-10-19',
  start_time: '09:00:00', end_time: '12:00:00', venue: 'Test hall',
  subject_name: 'Test mathematics', subject_code: 'MATH-TEST',
}];
let responses: Map<string, unknown>;

function panel(name: string) {
  return within(screen.getByRole('region', { name }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function settled() {
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument());
}

beforeEach(() => {
  mocks.chartData.mockClear();
  responses = new Map<string, unknown>([
    [SUMMARY, summary], [TODAY, today], [SESSIONS, [session, secondSession]],
    [`${SESSIONS}/session-a`, detail],
    [`${SESSIONS}/session-b`, { ...secondSession, coe_audit_status: 'idle', dean_approved: false }],
  ]);
  mocks.api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() };
  mocks.api.get.mockImplementation(async (path: string) => {
    if (!responses.has(path)) throw new Error(`Unexpected API request: ${path}`);
    const response = responses.get(path);
    if (response instanceof Error) throw response;
    return response;
  });
});

describe('Action-first Examination Dashboard', () => {
  it('uses the authenticated read APIs for real counts, timetable, activity and workflow detail', async () => {
    render(<ExamCellDashboardPage />);
    await settled();
    expect(screen.getByRole('heading', { name: 'Examination Dashboard' })).toBeVisible();
    for (const path of [SUMMARY, TODAY, SESSIONS, `${SESSIONS}/session-a`]) {
      expect(mocks.api.get).toHaveBeenCalledWith(path);
    }
    expect(mocks.api.get).toHaveBeenCalledTimes(4);
    const metrics = panel('Key examination metrics');
    for (const value of ['2', '3', '4', '5']) expect(metrics.getByText(value)).toBeVisible();
    const attention = panel('Needs attention');
    for (const value of ['6', '7', '8']) expect(attention.getByText(value)).toBeVisible();
    const timetable = panel('Today’s timetable');
    expect(timetable.getByText('Test mathematics')).toBeVisible();
    expect(timetable.getByText('09:00 – 12:00')).toBeVisible();
    expect(timetable.getByText('Test hall')).toBeVisible();
    expect(panel('Recent audit activity').getByText('RESULT SESSION CREATED')).toBeVisible();
    expect(panel('Recent audit activity').getByText(/Test operator/)).toBeVisible();
    expect(panel('Result publication progress').getByText('Awaiting approval')).toBeVisible();
    expect(panel('Result publication progress').getByText('Not declared')).toBeVisible();
  });

  it('retains all fifteen summary measures, the result chart data, and existing quick-action destinations', async () => {
    render(<ExamCellDashboardPage />);
    await settled();
    const overview = panel('Examination overview');
    for (const value of ['9', '120', '110', '100', '90', '80', '10', '11']) expect(overview.getByText(value)).toBeVisible();
    expect(panel('Declared result outcomes').getByText('PASS: 6')).toBeVisible();
    expect(panel('Declared result outcomes').getByText('FAIL: 1')).toBeVisible();
    const quickLinks = panel('Quick actions').getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(quickLinks).toEqual([
      '/exam-cell/my-tasks', '/exam-cell/form-fillup', '/exam-cell/admit-cards',
      '/exam-cell/seating', '/exam-cell/results', '/exam-cell/search',
    ]);
    expect(screen.getByRole('link', { name: 'Open Result Control' })).toHaveAttribute('href', '/exam-cell/results');
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(mocks.api.patch).not.toHaveBeenCalled();
    expect(mocks.api.del).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^(publish|declare|approve)( results| session| marks)?$/i })).not.toBeInTheDocument();
  });

  it('shows loading rather than fabricated zero counts or a pending approval', async () => {
    const pending = deferred<unknown>();
    responses.set(SUMMARY, pending.promise);
    responses.set(`${SESSIONS}/session-a`, pending.promise);
    render(<ExamCellDashboardPage />);
    expect(screen.getByText('Loading dashboard summary…')).toBeVisible();
    expect(panel('Key examination metrics').getAllByText('—')).toHaveLength(4);
    expect(panel('Key examination metrics').queryByText('0')).not.toBeInTheDocument();
    expect(await screen.findByText('Loading approval status…')).toBeVisible();
    expect(panel('Result publication progress').queryByText('Awaiting approval')).not.toBeInTheDocument();
  });

  it('distinguishes genuine zeros and empty responses from failures', async () => {
    responses.set(SUMMARY, {
      ...Object.fromEntries(Object.keys(summary).map((key) => [key, 0])),
      recent_activity: [], result_status_chart: [],
    });
    responses.set(TODAY, []);
    responses.set(SESSIONS, []);
    render(<ExamCellDashboardPage />);
    await settled();
    expect(panel('Key examination metrics').getAllByText('0')).toHaveLength(4);
    expect(screen.getByText('No exams scheduled for today.')).toBeVisible();
    expect(screen.getByText('No result sessions available. Manage sessions in Result Control.')).toBeVisible();
    expect(screen.getByText('No audit events recorded yet.')).toBeVisible();
    expect(screen.getByText('No officially declared result reports yet.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps timetable and workflow usable when summary fails, without presenting failures as zeros', async () => {
    responses.set(SUMMARY, new Error('Summary request failed'));
    render(<ExamCellDashboardPage />);
    await settled();
    expect(screen.getByRole('alert')).toHaveTextContent('Dashboard summary unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('Summary request failed');
    expect(panel('Key examination metrics').getAllByText('—')).toHaveLength(4);
    expect(screen.queryByText('No audit events recorded yet.')).not.toBeInTheDocument();
    expect(screen.getByText('Test mathematics')).toBeVisible();
    expect(screen.getByText('Awaiting approval')).toBeVisible();
    expect(panel('Declared result outcomes').getByText('Result summary is unavailable.')).toBeVisible();
    expect(screen.queryByText('No officially declared result reports yet.')).not.toBeInTheDocument();
    expect(mocks.chartData).not.toHaveBeenCalled();
  });

  it('passes real outcome counts to the chart and updates them on Retry without inventing publication stages', async () => {
    const outcomes = [
      { label: 'ABSENT', count: 1 }, { label: 'FAIL', count: 2 },
      { label: 'PASS', count: 8 }, { label: 'WITHHELD', count: 3 },
    ];
    responses.set(SUMMARY, { ...summary, result_status_chart: outcomes });
    responses.set(TODAY, new Error('Schedule request failed'));
    render(<ExamCellDashboardPage />);
    await settled();
    const chart = panel('Declared result outcomes');
    for (const row of outcomes) expect(chart.getByText(`${row.label}: ${row.count}`)).toBeVisible();
    expect(mocks.chartData).toHaveBeenLastCalledWith(outcomes.map((row) => ({ name: row.label, count: row.count })));
    expect(chart.getByText(/A student can have more than one report/)).toBeVisible();
    responses.set(SUMMARY, { ...summary, result_status_chart: [{ label: 'PASS', count: 9 }] });
    responses.set(TODAY, today);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await settled();
    expect(chart.getByText('PASS: 9')).toBeVisible();
    expect(chart.queryByText('PASS: 8')).not.toBeInTheDocument();
    expect(chart.queryByText('FAIL: 2')).not.toBeInTheDocument();
    expect(mocks.chartData).toHaveBeenLastCalledWith([{ name: 'PASS', count: 9 }]);
  });

  it('shows a timetable error and recovers all panels through Retry', async () => {
    responses.set(TODAY, new Error('Schedule request failed'));
    render(<ExamCellDashboardPage />);
    await settled();
    expect(panel('Today’s timetable').getByRole('alert')).toHaveTextContent('Timetable unavailable');
    expect(screen.queryByText('No exams scheduled for today.')).not.toBeInTheDocument();
    responses.set(TODAY, today);
    responses.set(SUMMARY, { ...summary, todays_exams: 25 });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await settled();
    expect(screen.getByText('Test mathematics')).toBeVisible();
    expect(panel('Key examination metrics').getByText('25')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    for (const path of [SUMMARY, TODAY, SESSIONS, `${SESSIONS}/session-a`]) {
      expect(mocks.api.get.mock.calls.filter(([url]) => url === path)).toHaveLength(2);
    }
  });

  it('does not mistake a forbidden session-list request for an empty result history', async () => {
    responses.set(SESSIONS, new Error('Forbidden'));
    render(<ExamCellDashboardPage />);
    await settled();
    expect(panel('Result publication progress').getByRole('alert')).toHaveTextContent('Forbidden');
    expect(screen.queryByText(/No result sessions available/)).not.toBeInTheDocument();
    expect(mocks.api.get).not.toHaveBeenCalledWith(`${SESSIONS}/session-a`);
  });

  it('never infers approval from the list when the authoritative detail request fails', async () => {
    responses.set(SESSIONS, [{ ...session, dean_approved: true, coe_audit_status: 'passed' }]);
    responses.set(`${SESSIONS}/session-a`, new Error('Detail request failed'));
    render(<ExamCellDashboardPage />);
    await settled();
    const progress = panel('Result publication progress');
    expect(progress.getByRole('alert')).toHaveTextContent('Approval status unavailable');
    expect(progress.queryByText('Approved')).not.toBeInTheDocument();
    expect(progress.queryByText('Awaiting approval')).not.toBeInTheDocument();
  });

  it('shows audit anomalies and rejected approval without a ready-to-publish claim', async () => {
    responses.set(`${SESSIONS}/session-a`, { ...detail, coe_audit_status: 'anomaly', dean_approval_status: 'REJECTED' });
    render(<ExamCellDashboardPage />);
    await settled();
    expect(screen.getByText('Anomaly detected')).toBeVisible();
    expect(screen.getByText('Approval rejected')).toBeVisible();
    expect(screen.getByText('Not declared')).toBeVisible();
    expect(screen.queryByText('Ready to publish')).not.toBeInTheDocument();
  });

  it('does not label an approved but undeclared session as published', async () => {
    responses.set(`${SESSIONS}/session-a`, { ...detail, dean_approved: true, dean_approval_status: 'APPROVED' });
    render(<ExamCellDashboardPage />);
    await settled();
    expect(screen.getByText('Approved')).toBeVisible();
    expect(screen.getByText('Not declared')).toBeVisible();
    expect(screen.queryByText('Declared')).not.toBeInTheDocument();
    expect(screen.queryByText('Ready to publish')).not.toBeInTheDocument();
  });

  it('uses declared_at for official declaration and labels unavailable workflow fields honestly', async () => {
    responses.set(SESSIONS, [session]);
    responses.set(`${SESSIONS}/session-a`, { ...session, declared_at: '2026-10-19T10:00:00Z' });
    render(<ExamCellDashboardPage />);
    await settled();
    expect(screen.getByText('Declared')).toBeVisible();
    expect(screen.getByText(/Declared on/)).toBeVisible();
    expect(screen.getAllByText('Status unavailable')).toHaveLength(2);
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
  });

  it('clears the old session approval while another session loads', async () => {
    const pending = deferred<unknown>();
    responses.set(`${SESSIONS}/session-a`, { ...detail, dean_approved: true });
    responses.set(`${SESSIONS}/session-b`, pending.promise);
    render(<ExamCellDashboardPage />);
    await settled();
    expect(screen.getByText('Approved')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Result session'), { target: { value: 'session-b' } });
    expect(screen.getByText('Loading approval status…')).toBeVisible();
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    await act(async () => { pending.resolve({ ...secondSession, coe_audit_status: 'idle', dean_approved: false }); });
    await settled();
    expect(screen.getByText('Awaiting approval')).toBeVisible();
  });

  it('ignores a late approval response for a previously selected session', async () => {
    const late = deferred<unknown>();
    responses.set(`${SESSIONS}/session-a`, late.promise);
    render(<ExamCellDashboardPage />);
    await screen.findByText('Loading approval status…');
    fireEvent.change(screen.getByLabelText('Result session'), { target: { value: 'session-b' } });
    await settled();
    await act(async () => { late.resolve({ ...detail, dean_approved: true }); });
    expect(screen.getByLabelText('Result session')).toHaveValue('session-b');
    expect(screen.getByText('Awaiting approval')).toBeVisible();
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
  });

  it('retries failed approval data without mutation requests', async () => {
    responses.set(`${SESSIONS}/session-a`, new Error('Detail request failed'));
    render(<ExamCellDashboardPage />);
    await settled();
    expect(panel('Result publication progress').getByRole('alert')).toHaveTextContent('Approval status unavailable');
    responses.set(`${SESSIONS}/session-a`, { ...detail, dean_approved: true, declared_at: '2026-10-19T10:00:00Z' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByText('Awaiting approval')).not.toBeInTheDocument();
    await settled();
    expect(screen.getByText('Declared')).toBeVisible();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('does not retain a previous authentication context’s counts or approvals', async () => {
    const { rerender } = render(<ExamCellDashboardPage />);
    await settled();
    const pending = deferred<unknown>();
    const oldGet = mocks.api.get;
    mocks.api = { get: vi.fn(() => pending.promise), post: vi.fn(), patch: vi.fn(), del: vi.fn() };
    rerender(<ExamCellDashboardPage />);
    expect(panel('Key examination metrics').getAllByText('—')).toHaveLength(4);
    expect(screen.queryByText('Awaiting approval')).not.toBeInTheDocument();
    expect(screen.queryByText('Test mathematics')).not.toBeInTheDocument();
    expect(oldGet).toHaveBeenCalledTimes(4);
  });

  it('handles incomplete schedule labels and limits the preview while keeping full schedule access', async () => {
    responses.set(TODAY, Array.from({ length: 6 }, (_, index) => ({
      ...today[0], exam_schedule_id: `exam-${index}`, exam_type: null,
      subject_name: null, subject_code: null, venue: null, start_time: null, end_time: null,
    })));
    render(<ExamCellDashboardPage />);
    await settled();
    const timetable = panel('Today’s timetable');
    expect(timetable.getAllByText('Subject not specified')).toHaveLength(4);
    expect(timetable.getAllByText('Venue not assigned')).toHaveLength(4);
    expect(timetable.getByText('Showing 4 of 6 exams.')).toBeVisible();
    expect(timetable.getByRole('link', { name: 'View full schedule' })).toHaveAttribute('href', '/exam-cell/schedule');
  });

  it('expands and collapses today’s timetable without another API request', async () => {
    responses.set(TODAY, Array.from({ length: 6 }, (_, index) => ({ ...today[0], exam_schedule_id: `exam-${index}` })));
    render(<ExamCellDashboardPage />);
    await settled();
    const timetable = panel('Today’s timetable');
    const expand = timetable.getByRole('button', { name: 'Show all 6 exams' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(expand).toHaveAttribute('aria-controls', 'dashboard-timetable');
    fireEvent.click(expand);
    expect(timetable.getAllByText('Test mathematics')).toHaveLength(6);
    expect(timetable.getByText('Showing 6 of 6 exams.')).toBeVisible();
    const collapse = timetable.getByRole('button', { name: 'Show fewer exams' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(collapse);
    expect(timetable.getAllByText('Test mathematics')).toHaveLength(4);
    expect(mocks.api.get).toHaveBeenCalledTimes(4);
  });

  it('filters result sessions using declared_at and loads the matching session detail', async () => {
    const declared = { ...secondSession, declared_at: '2026-10-19T10:00:00Z' };
    responses.set(SESSIONS, [session, declared]);
    responses.set(`${SESSIONS}/session-b`, { ...declared, dean_approved: true, coe_audit_status: 'passed' });
    render(<ExamCellDashboardPage />);
    await settled();
    const filters = within(screen.getByRole('group', { name: 'Filter result sessions' }));
    expect(filters.getByRole('button', { name: 'All sessions' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(filters.getByRole('button', { name: 'Declared sessions' }));
    await settled();
    expect(screen.getByLabelText('Result session')).toHaveValue('session-b');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText('Declared')).toBeVisible();
    fireEvent.click(filters.getByRole('button', { name: 'Awaiting declaration' }));
    await settled();
    expect(screen.getByLabelText('Result session')).toHaveValue('session-a');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText('Not declared')).toBeVisible();
    expect(filters.getByRole('button', { name: 'Awaiting declaration' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(filters.getByRole('button', { name: 'All sessions' }));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('keeps filters usable when no session matches and hides the previous approval state', async () => {
    render(<ExamCellDashboardPage />);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Declared sessions' }));
    expect(screen.getByText('No sessions match this filter. Choose another filter to see more.')).toBeVisible();
    expect(screen.queryByLabelText('Result session')).not.toBeInTheDocument();
    expect(screen.queryByText('Awaiting approval')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All sessions' }));
    await settled();
    expect(screen.getByLabelText('Result session')).toBeVisible();
  });

  it('omits the header actions and summary note while preserving the tasks shortcut', async () => {
    render(<ExamCellDashboardPage />);
    const expectRemovedItemsAbsent = () => {
      expect(screen.queryByRole('link', { name: 'My Tasks' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Refresh/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/Summary counts cover your current tenant/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Summary loaded at|Updating summary|Summary not loaded/)).not.toBeInTheDocument();
    };
    expectRemovedItemsAbsent();
    await settled();
    expectRemovedItemsAbsent();
    expect(screen.getByRole('heading', { name: 'Examination Dashboard' })).toBeVisible();
    expect(panel('Quick actions').getByRole('link', { name: 'My tasks inbox' })).toHaveAttribute('href', '/exam-cell/my-tasks');
  });

  it('targets existing portal routes for every link, including the corrected backlog shortcut', async () => {
    render(<ExamCellDashboardPage />);
    await settled();
    const destinations = new Set(screen.getAllByRole('link').map((link) => link.getAttribute('href')));
    for (const href of destinations) {
      expect(href).toMatch(/^\/exam-cell\//);
      expect(existsSync(resolve('src/app/(portals)', href!.slice(1), 'page.tsx')), `Missing page for ${href}`).toBe(true);
    }
    expect(screen.getByRole('link', { name: /Supplementary pending/ })).toHaveAttribute('href', '/exam-cell/backlog-exams');
  });

  it('uses stretched card columns, mobile-safe text, and consistent summary spacing', async () => {
    render(<ExamCellDashboardPage />);
    await settled();
    expect(screen.getByRole('region', { name: 'Needs attention' }).parentElement).toHaveClass('items-stretch');
    expect(screen.getByRole('region', { name: 'Today’s timetable' })).toHaveClass('min-w-0');
    expect(panel('Quick actions').getByRole('link', { name: 'Generate hall tickets' })).toHaveClass('whitespace-normal', 'min-h-11');
    expect(screen.getByText('Today’s exams, pending work, and result progress.')).toBeVisible();
  });
});

describe('Dashboard-only publication pipeline layout', () => {
  const steps: PipelineStep[] = [{
    key: 'publish', label: 'Publication test', description: 'Test description',
    status: 'pending', statusLabel: 'Not declared', icon: PIPELINE_ICONS.publish,
  }];

  it('stretches workflow cards and wraps badges only in the dashboard layout', () => {
    const { container, rerender } = render(<ResultPublishingPipeline compact dashboardLayout steps={steps} />);
    expect(container.querySelector('.grid')).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'xl:grid-cols-4');
    expect(screen.getByText('Not declared')).toHaveClass('whitespace-normal');
    rerender(<ResultPublishingPipeline compact steps={steps} />);
    expect(container.querySelector('.grid')).toHaveClass('grid-cols-2', 'md:grid-cols-4');
    expect(screen.getByText('Not declared')).not.toHaveClass('whitespace-normal');
  });
});
