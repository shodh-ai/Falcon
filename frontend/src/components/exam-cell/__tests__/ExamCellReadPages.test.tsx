import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentTimelinePage from '@/app/(portals)/exam-cell/student-timeline/page';
import ReportsPage from '@/app/(portals)/exam-cell/reports/page';
import AnalyticsPage from '@/app/(portals)/exam-cell/analytics/page';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  error: vi.fn(), barData: vi.fn(), pieData: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { error: mocks.error } }));
vi.mock('next/navigation', () => {
  const params = new URLSearchParams('student=student-a');
  return { useSearchParams: () => params };
});
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ data, children }: { data: unknown; children: ReactNode }) => {
    mocks.barData(data);
    return <div>{children}</div>;
  },
  PieChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pie: ({ data }: { data: unknown }) => { mocks.pieData(data); return null; },
  Bar: () => null, Cell: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));

const REPORTS = '/api/exam-cell/reports/summary?semester=4';
const ANALYTICS = '/api/exam-cell/analytics/advanced?semester=4';
const TIMELINE = '/api/exam-cell/students/student-a/timeline';
const reports = {
  semester: 4, pass_fail: [{ label: 'FAIL', count: 1 }, { label: 'PASS', count: 6 }],
  pass_percentage: 86, pending_backlog: 1,
  top_rankers: [{ name: 'Test Ranker', enrollment_number: 'TEST-001', cgpa: 8.25, sgpa: 8.5 }],
  department_enrollment: [{ department: 'Test Department', students: 6 }],
};
const analytics = {
  semester: 4, pass_fail: reports.pass_fail,
  grade_distribution: [{ grade: 'A', count: 6 }, { grade: 'F', count: 1 }],
  subject_analysis: [{ subject_code: 'TEST-101', subject_name: 'Test Course', avg_marks: 75.25, students: 6 }],
  faculty_performance: [{ name: 'Test Faculty', submissions: 7 }],
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => {
  expect(mocks.api.post).not.toHaveBeenCalled();
  expect(mocks.api.patch).not.toHaveBeenCalled();
  expect(mocks.api.del).not.toHaveBeenCalled();
});

describe('Examination read pages retain their existing API contracts', () => {
  it('renders populated timeline events including the official result', async () => {
    mocks.api.get.mockResolvedValue({
      student: { name: 'Test Student', enrollment_number: 'TEST-001' },
      timeline: [
        { stage: 'Hall Ticket', status: 'GENERATED', at: '2026-01-01T00:00:00Z' },
        { stage: 'Result', status: 'PASS', at: '2026-01-02T00:00:00Z' },
        { stage: 'Revaluation', status: 'PENDING', at: null },
      ],
    });
    render(<StudentTimelinePage />);
    expect(await screen.findByText('Test Student')).toBeVisible();
    expect(screen.getByText('GENERATED')).toBeVisible();
    expect(screen.getByText('PASS')).toBeVisible();
    expect(screen.getByText('Revaluation')).toBeVisible();
    expect(mocks.api.get).toHaveBeenCalledWith(TIMELINE);
  });

  it('renders a student with no events without crashing', async () => {
    mocks.api.get.mockResolvedValue({ student: { name: 'New Student', enrollment_number: null }, timeline: [] });
    render(<StudentTimelinePage />);
    expect(await screen.findByText('New Student')).toBeVisible();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('renders report percentages and numeric GPA values without toFixed errors', async () => {
    mocks.api.get.mockResolvedValue(reports);
    render(<ReportsPage />);
    expect(await screen.findByText('Test Ranker')).toBeVisible();
    expect(screen.getByText('86%')).toBeVisible();
    expect(screen.getByText('8.25')).toBeVisible();
    expect(screen.getByText('8.50')).toBeVisible();
    expect(screen.getByText('6 students')).toBeVisible();
    expect(mocks.barData).toHaveBeenCalledWith([{ name: 'FAIL', count: 1 }, { name: 'PASS', count: 6 }]);
    expect(mocks.api.get).toHaveBeenCalledWith(REPORTS);
  });

  it('renders the existing report empty state for genuinely empty results', async () => {
    mocks.api.get.mockResolvedValue({ ...reports, pass_fail: [], top_rankers: [], department_enrollment: [], pass_percentage: 0 });
    render(<ReportsPage />);
    expect(await screen.findByText('No declared results for this semester.')).toBeVisible();
    expect(screen.getByText('No grade cards generated for this semester.')).toBeVisible();
  });

  it('renders real-shaped analytics data in all four panels', async () => {
    mocks.api.get.mockResolvedValue(analytics);
    render(<AnalyticsPage />);
    expect(await screen.findByText('Test Course')).toBeVisible();
    expect(screen.getByText('75.3')).toBeVisible();
    expect(mocks.barData).toHaveBeenCalledWith([{ name: 'FAIL', count: 1 }, { name: 'PASS', count: 6 }]);
    expect(mocks.barData).toHaveBeenCalledWith([{ name: 'Test Faculty', submissions: 7 }]);
    expect(mocks.pieData).toHaveBeenCalledWith(analytics.grade_distribution);
    expect(mocks.api.get).toHaveBeenCalledWith(ANALYTICS);
  });

  it('renders genuine empty analytics without fabricated charts', async () => {
    mocks.api.get.mockResolvedValue({ semester: 4, pass_fail: [], grade_distribution: [], subject_analysis: [], faculty_performance: [] });
    render(<AnalyticsPage />);
    expect(await screen.findByText('No result data yet.')).toBeVisible();
    expect(screen.getByText('No grade data yet.')).toBeVisible();
    expect(screen.getByText('No subject result data.')).toBeVisible();
    expect(screen.getByText('No faculty submission data.')).toBeVisible();
    expect(mocks.barData).not.toHaveBeenCalled();
  });

  it.each([
    ['Timeline', StudentTimelinePage], ['Reports', ReportsPage], ['Analytics', AnalyticsPage],
  ] as const)('%s reports an API failure instead of claiming success or showing a fabricated chart', async (_name, Page) => {
    mocks.api.get.mockRejectedValue(new Error('Database unavailable'));
    render(<Page />);
    if (_name === 'Analytics') {
      expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    } else {
      await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Database unavailable'));
    }
    expect(mocks.barData).not.toHaveBeenCalled();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
