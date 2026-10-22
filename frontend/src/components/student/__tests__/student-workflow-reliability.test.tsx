import { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GraduationPage from '@/app/(portals)/student/exit/page';
import AttemptTestPage from '@/app/(portals)/student/weekly-tests/attempt/[testId]/page';
import WeeklyTestsPage from '@/app/(portals)/student/weekly-tests/page';

const mocks = vi.hoisted(() => ({
  query: '',
  router: { replace: vi.fn() },
  api: { get: vi.fn(), post: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Student' }, token: 'test-token' }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: mocks.toast }));
vi.mock('@/components/student/ExitAlumniPanel', () => ({ ExitAlumniPanel: () => <div>Alumni panel</div> }));
vi.mock('@/components/student/DegreeConvocationPanel', () => ({ DegreeConvocationPanel: () => <div>Degree panel</div> }));
vi.mock('@/components/student/StudentTabBar', () => ({
  StudentTabBar: ({ tabs, onChange }: { tabs: { id: string; label: string }[]; onChange: (id: string) => void }) => (
    <div>{tabs.map((tab) => <button key={tab.id} onClick={() => onChange(tab.id)}>{tab.label}</button>)}</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = '';
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('student workflow reliability', () => {
  it('follows graduation deep links and browser navigation without duplicated tab state', () => {
    mocks.query = 'tab=degree';
    const view = render(<GraduationPage />);
    expect(screen.getByText('Degree panel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exit & Alumni' }));
    expect(mocks.router.replace).toHaveBeenCalledWith('/student/exit', { scroll: false });
    mocks.query = '';
    view.rerender(<GraduationPage />);
    expect(screen.getByText('Alumni panel')).toBeInTheDocument();
    mocks.query = 'tab=certificates';
    view.rerender(<GraduationPage />);
    expect(screen.getByText('Degree panel')).toBeInTheDocument();
  });

  async function startAttempt(questionCount = 10) {
    mocks.api.get.mockResolvedValue({
      course_code: 'CS101', course_name: 'Programming', test_type: 'WT1',
      question_paper_url: '/uploads/paper.pdf',
      question_count: questionCount, max_marks: 20, scoring_version: 2,
    });
    const params = Promise.resolve({ testId: 'weekly-test' });
    await act(async () => {
      render(<Suspense fallback={<div>Loading route</div>}><AttemptTestPage params={params} /></Suspense>);
      await params;
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Enter Full Screen/ }));
    });
    await screen.findByRole('heading', { name: 'OMR Sheet' });
  }

  it('keeps the paper stable while answering and submits only once from both submit controls', async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.api.post.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await startAttempt();
    const paper = screen.getByTitle('Question Paper');
    const src = paper.getAttribute('src');
    expect(src).toContain('access_token=test-token');
    fireEvent.click(screen.getAllByRole('radio')[0]);
    expect(paper.getAttribute('src')).toBe(src);
    fireEvent.click(screen.getByRole('button', { name: 'Final Submit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Test' }));
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    expect(mocks.api.post).toHaveBeenCalledWith('/api/weekly-tests/student/weekly-test/submit', {
      answers: ['A', '', '', '', '', '', '', '', '', ''], violation_count: 0,
    });
    await act(async () => finish({}));
    expect(mocks.router.replace).toHaveBeenCalledWith('/student/weekly-tests');
  });

  it('shows and submits exactly the configured number of questions', async () => {
    mocks.api.post.mockResolvedValue({});
    await startAttempt(4);
    expect(screen.getAllByRole('radio')).toHaveLength(16);
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Final Submit' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith(
      '/api/weekly-tests/student/weekly-test/submit',
      { answers: ['A', '', '', ''], violation_count: 0 },
    ));
  });

  it('auto-submits the actual second fullscreen violation without side effects in a state updater', async () => {
    mocks.api.post.mockResolvedValue({});
    await startAttempt();
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(mocks.api.post).not.toHaveBeenCalled();
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledTimes(1));
    expect(mocks.api.post.mock.calls[0][1].violation_count).toBe(2);
  });

  it('retains answers and permits retry when automatic submission fails', async () => {
    mocks.api.post.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({});
    await startAttempt();
    fireEvent.click(screen.getAllByRole('radio')[0]);
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('Network unavailable'));
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(screen.getAllByRole('radio')[0]).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Test' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledTimes(2));
  });

  it('updates a scheduled weekly test to live when its start time arrives', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
    mocks.api.get.mockResolvedValue([{
      test_id: 'scheduled', course_id: 'course', course_code: 'CS101', course_name: 'Programming',
      test_type: 'WT1', start_time: '2026-10-14T10:00:02Z', end_time: '2026-10-14T11:00:00Z',
      status: 'SCHEDULED', is_active: true,
    }]);
    await act(async () => { render(<WeeklyTestsPage />); });
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('Live Now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Attempt Test' })).toHaveAttribute('href', '/student/weekly-tests/attempt/scheduled');
  });
});
