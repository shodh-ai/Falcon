import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentCoursesIndexPage from '@/app/(portals)/student/courses/page';
import { useStudentCourses } from '@/components/student/useStudentCourses';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  api: null as { get: ReturnType<typeof vi.fn> } | null,
  user: null as { user_id: string; tenant_id: string } | null,
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/components/lms/StudentLiveClassUpdates', () => ({ StudentLiveClassUpdates: () => null }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function enrollment(semester = 4, status = 'ENROLLED') {
  const id = crypto.randomUUID();
  return {
    enrollment_id: crypto.randomUUID(),
    semester,
    status,
    course: {
      course_id: id,
      course_code: `COURSE-${id.slice(0, 8)}`,
      course_name: `Course ${id}`,
      credits: 3,
      is_elective: true,
    },
  };
}

describe('Student course index reliability', () => {
  beforeEach(() => {
    mocks.user = { user_id: crypto.randomUUID(), tenant_id: crypto.randomUUID() };
    mocks.get.mockReset();
    mocks.api = { get: mocks.get };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders only actual API course identifiers, credits and semester', async () => {
    const row = enrollment(6);
    mocks.get.mockResolvedValue({ current_semester: 6, enrollments: [row] });
    render(<StudentCoursesIndexPage />);
    expect(await screen.findByText(row.course.course_code)).toBeInTheDocument();
    expect(screen.getByText(row.course.course_name)).toBeInTheDocument();
    expect(screen.getByText('Semester 6')).toBeInTheDocument();
    expect(screen.getByText('1 subject · 3 credits this semester')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open workspace/ })).toHaveAttribute('href', `/student/courses/${row.course.course_id}`);
    expect(mocks.get).toHaveBeenCalledWith('/api/academics/courses/my-enrollments');
  });

  it('uses the latest active semester for the supported legacy array response', async () => {
    const old = enrollment(2, 'COMPLETED');
    const current = enrollment(4);
    const dropped = enrollment(5, 'DROPPED');
    mocks.get.mockResolvedValue([old, current, dropped]);
    render(<StudentCoursesIndexPage />);
    expect(await screen.findByText(current.course.course_code)).toBeInTheDocument();
    expect(screen.queryByText(old.course.course_code)).not.toBeInTheDocument();
    expect(screen.queryByText(dropped.course.course_code)).not.toBeInTheDocument();
    expect(screen.getByText('Semester 4')).toBeInTheDocument();
  });

  it('shows an honest empty state, without substituting demonstration courses', async () => {
    mocks.get.mockResolvedValue({ current_semester: 3, enrollments: [] });
    render(<StudentCoursesIndexPage />);
    expect(await screen.findByText('No enrolled subjects')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to CBCS registration' })).toHaveAttribute('href', '/student/registration');
    expect(screen.queryByRole('link', { name: /Open workspace/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ends a permanently pending read after the existing deadline and supports retry', async () => {
    vi.useFakeTimers();
    const row = enrollment();
    mocks.get.mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce({ current_semester: 4, enrollments: [row] });
    render(<StudentCoursesIndexPage />);
    expect(screen.getByText('Loading your courses…')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.queryByText('Loading your courses…')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load courses');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(screen.getByText(row.course.course_code)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it('does not reveal raw backend errors and retries a rejected read', async () => {
    const row = enrollment();
    mocks.get.mockRejectedValueOnce(new Error('Sensitive database connection detail'))
      .mockResolvedValueOnce({ current_semester: 4, enrollments: [row] });
    render(<StudentCoursesIndexPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load courses');
    expect(screen.queryByText(/Sensitive database/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(row.course.course_code)).toBeInTheDocument();
  });

  it('keeps a timed-out response from replacing a successful retry', async () => {
    vi.useFakeTimers();
    const first = deferred<unknown>();
    const stale = enrollment();
    const current = enrollment();
    mocks.get.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ current_semester: 4, enrollments: [current] });
    render(<StudentCoursesIndexPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    await act(async () => { first.resolve({ current_semester: 4, enrollments: [stale] }); });
    expect(screen.getByText(current.course.course_code)).toBeInTheDocument();
    expect(screen.queryByText(stale.course.course_code)).not.toBeInTheDocument();
  });

  it('hides a previous student immediately and ignores their late response', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const old = enrollment();
    const current = enrollment();
    mocks.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<StudentCoursesIndexPage />);
    mocks.user = { user_id: crypto.randomUUID(), tenant_id: crypto.randomUUID() };
    view.rerender(<StudentCoursesIndexPage />);
    await act(async () => { first.resolve({ current_semester: 4, enrollments: [old] }); });
    expect(screen.queryByText(old.course.course_code)).not.toBeInTheDocument();
    expect(screen.getByText('Loading your courses…')).toBeInTheDocument();
    await act(async () => { second.resolve({ current_semester: 4, enrollments: [current] }); });
    expect(screen.getByText(current.course.course_code)).toBeInTheDocument();
  });

  it.each(['tenant', 'api'] as const)('hides already loaded records when the %s context changes', async (context) => {
    const pending = deferred<unknown>();
    const old = enrollment();
    const current = enrollment();
    mocks.get.mockResolvedValueOnce({ current_semester: 4, enrollments: [old] }).mockReturnValueOnce(pending.promise);
    const view = render(<StudentCoursesIndexPage />);
    await screen.findByText(old.course.course_code);
    if (context === 'tenant') mocks.user = { ...mocks.user!, tenant_id: crypto.randomUUID() };
    else mocks.api = { get: mocks.get };
    view.rerender(<StudentCoursesIndexPage />);
    expect(screen.queryByText(old.course.course_code)).not.toBeInTheDocument();
    expect(screen.getByText('Loading your courses…')).toBeInTheDocument();
    await act(async () => { pending.resolve({ current_semester: 4, enrollments: [current] }); });
    expect(screen.getByText(current.course.course_code)).toBeInTheDocument();
  });

  it('does not request courses without a signed-in student', () => {
    mocks.user = null;
    const { result } = renderHook(() => useStudentCourses());
    expect(result.current.courses).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('ignores a late rejected read after unmount', async () => {
    const request = deferred<unknown>();
    mocks.get.mockReturnValueOnce(request.promise);
    const view = renderHook(() => useStudentCourses());
    view.unmount();
    await act(async () => { request.reject(new Error('Late service error')); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
