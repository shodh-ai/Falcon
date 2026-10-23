import type { ReactNode, SelectHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyWeeklyTestsPage from '@/app/(portals)/faculty/weekly-tests/page';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  auth: { user: { user_id: 'faculty-1' }, token: 'token-1' },
  courses: [{ course_id: 'course-1', course_code: 'SYN101', course_name: 'Synthetic Course' }],
  coursesLoading: false,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => fixtures.auth }));
vi.mock('next/navigation', () => ({ usePathname: () => '/faculty/weekly-tests' }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/components/faculty/useFacultyCourses', () => ({ useFacultyCourses: () => ({ courses: fixtures.courses, loading: fixtures.coursesLoading }) }));
vi.mock('@/lib/faculty-demo-mode', () => ({ withFacultyDemoFallback: (live: unknown) => live, isEmptyArray: (rows: unknown[]) => !rows.length, isFacultyDemoEntityId: () => false, isFacultyDemoSmokeId: () => false }));
vi.mock('@/components/faculty', () => ({
  FacultyPageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  FacultyPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  FacultyPanel: ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  FacultyErrorBanner: ({ message }: { message: string }) => <p role="alert">{message}</p>,
}));
function row(id: string) {
  return { test_id: id, course_code: id, course_name: `Course ${id}`, test_type: 'WT1', is_active: true, start_time: '2098-01-01T10:00:00Z', end_time: '2098-01-01T11:00:00Z', response_count: 0 };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}
function newApi() {
  return { get: vi.fn().mockResolvedValue([row('NEW-ACCOUNT')]), post: vi.fn(), patch: vi.fn(), del: vi.fn() };
}
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api = { get: vi.fn().mockResolvedValue([row('OLD-ACCOUNT')]), post: vi.fn(), patch: vi.fn(), del: vi.fn() };
  fixtures.auth = { user: { user_id: 'faculty-1' }, token: 'token-1' };
  fixtures.courses = [{ course_id: 'course-1', course_code: 'SYN101', course_name: 'Synthetic Course' }];
  fixtures.coursesLoading = false;
});
afterEach(cleanup);

describe('weekly-test request and mutation ownership', () => {
  it('never displays an old account list after changing accounts', async () => {
    const pending = deferred<ReturnType<typeof row>[]>();
    fixtures.api.get.mockReturnValue(pending.promise);
    const view = render(<FacultyWeeklyTestsPage />);
    fixtures.api = newApi();
    fixtures.auth = { user: { user_id: 'faculty-2' }, token: 'token-2' };
    view.rerender(<FacultyWeeklyTestsPage />);
    await screen.findByText('NEW-ACCOUNT');
    await act(async () => { pending.resolve([row('PRIVATE-OLD')]); });
    expect(screen.queryByText('PRIVATE-OLD')).not.toBeInTheDocument();
  });

  it('ignores a closed result request when the next test results finish first', async () => {
    const pending = deferred<{ test: object; responses: Array<{ student_name: string; score: number }> }>();
    fixtures.api.get.mockImplementation((path: string) => {
      if (path.includes('/first/results')) return pending.promise;
      if (path.includes('/second/results')) return Promise.resolve({ test: {}, responses: [{ student_name: 'Current Student', score: 8 }] });
      return Promise.resolve([row('first'), row('second')]);
    });
    render(<FacultyWeeklyTestsPage />);
    await screen.findByText('first');
    fireEvent.click(screen.getAllByRole('button', { name: 'Results' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Results' })[1]);
    await screen.findByText('Current Student');
    await act(async () => { pending.resolve({ test: {}, responses: [{ student_name: 'Private Old Student', score: 4 }] }); });
    expect(screen.queryByText('Private Old Student')).not.toBeInTheDocument();
    expect(screen.getByText('Current Student')).toBeInTheDocument();
  });

  it('guards duplicate toggles and releases a replacement API workspace without old notifications', async () => {
    const pending = deferred<object>();
    const oldApi = fixtures.api;
    oldApi.patch.mockReturnValue(pending.promise);
    const view = render(<FacultyWeeklyTestsPage />);
    const toggle = await screen.findByRole('button', { name: 'Deactivate' });
    act(() => { fireEvent.click(toggle); fireEvent.click(toggle); });
    expect(oldApi.patch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Schedule Test' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Upload Answer Key/ })).toBeDisabled();
    fixtures.api = newApi();
    view.rerender(<FacultyWeeklyTestsPage />);
    await screen.findByText('NEW-ACCOUNT');
    expect(screen.getByRole('button', { name: /Upload Answer Key/ })).toBeEnabled();
    await act(async () => { pending.resolve({}); });
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(oldApi.get).toHaveBeenCalledTimes(1);
    expect(fixtures.api.get).toHaveBeenCalledTimes(1);
  });

  async function fillSchedule() {
    await screen.findByText('OLD-ACCOUNT');
    fireEvent.change(screen.getByLabelText('Course'), { target: { value: 'course-1' } });
    fireEvent.change(screen.getByLabelText('Start Time'), { target: { value: '2098-01-01T10:00' } });
    fireEvent.change(screen.getByLabelText('End Time'), { target: { value: '2098-01-01T11:00' } });
    fireEvent.change(screen.getByLabelText('Question Paper (PDF)'), { target: { files: [new File(['paper'], 'paper.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: /Upload Answer Key/ }));
    screen.getAllByLabelText('A').forEach((option) => fireEvent.click(option));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer Key' }));
  }

  it('blocks a removed or loading teaching allocation before upload and preserves the scheduling draft', async () => {
    const view = render(<FacultyWeeklyTestsPage />);
    await fillSchedule();
    fixtures.coursesLoading = true;
    view.rerender(<FacultyWeeklyTestsPage />);
    expect(screen.getByRole('button', { name: 'Schedule Test' })).toBeDisabled();
    expect(screen.getByLabelText('Start Time')).toHaveValue('2098-01-01T10:00');
    fixtures.coursesLoading = false;
    fixtures.courses = [];
    view.rerender(<FacultyWeeklyTestsPage />);
    const schedule = screen.getByRole('button', { name: 'Schedule Test' });
    expect(schedule).toBeDisabled();
    fireEvent.click(schedule);
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Answer Key Complete/ })).toBeEnabled();
    fixtures.courses = [{ course_id: 'course-1', course_code: 'SYN101', course_name: 'Synthetic Course' }];
    view.rerender(<FacultyWeeklyTestsPage />);
    expect(screen.getByRole('button', { name: 'Schedule Test' })).toBeEnabled();
    expect(screen.getByLabelText('Start Time')).toHaveValue('2098-01-01T10:00');
  });

  it('stops scheduling after an upload completes for an account that has signed out', async () => {
    const upload = deferred<{ url: string }>();
    const oldApi = fixtures.api;
    oldApi.post.mockReturnValue(upload.promise);
    const view = render(<FacultyWeeklyTestsPage />);
    await fillSchedule();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Schedule Test' })); fireEvent.click(screen.getByRole('button', { name: 'Schedule Test' })); });
    expect(oldApi.post).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Start Time')).toBeDisabled();
    fixtures.api = newApi();
    fixtures.auth = { user: { user_id: 'faculty-2' }, token: 'token-2' };
    view.rerender(<FacultyWeeklyTestsPage />);
    await screen.findByText('NEW-ACCOUNT');
    await act(async () => { upload.resolve({ url: '/private/old-paper.pdf' }); });
    expect(oldApi.post).toHaveBeenCalledTimes(1);
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Start Time')).toHaveValue('');
  });

  it('retains the scheduling draft after an upload error and unlocks retry', async () => {
    const upload = deferred<{ url: string }>();
    fixtures.api.post.mockReturnValue(upload.promise);
    render(<FacultyWeeklyTestsPage />);
    await fillSchedule();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Test' }));
    await act(async () => { upload.reject(new Error('Upload unavailable')); });
    expect(fixtures.toast.error).toHaveBeenCalledWith('Upload unavailable');
    expect(screen.getByLabelText('Start Time')).toHaveValue('2098-01-01T10:00');
    expect(screen.getByRole('button', { name: /Answer Key Complete/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Schedule Test' })).toBeEnabled();
  });
});
