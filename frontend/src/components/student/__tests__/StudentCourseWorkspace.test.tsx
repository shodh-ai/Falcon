import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentCourseWorkspacePage from '@/app/(portals)/student/courses/[courseId]/page';
import type { StudentWorkspace } from '@/lib/api/lms';

const mocks = vi.hoisted(() => ({ courseId: 'course-a', get: vi.fn(), api: null as { get: ReturnType<typeof vi.fn> } | null }));
vi.mock('next/navigation', () => ({ useParams: () => ({ courseId: mocks.courseId }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/components/lms/StudentMaterialsTab', () => ({ StudentMaterialsTab: () => <div>Course materials</div> }));
vi.mock('@/components/lms/StudentAssignmentsTab', () => ({ StudentAssignmentsTab: ({ onSubmitted }: { onSubmitted: () => void }) => <button onClick={onSubmitted}>Submit assignment</button> }));
vi.mock('@/components/lms/StudentAnnouncementsTab', () => ({ StudentAnnouncementsTab: () => <div>Announcements</div> }));
vi.mock('@/components/lms/LmsExtendedTabs', () => ({ LmsExtendedTabs: () => <div>Live class</div> }));

function workspace(code: string): StudentWorkspace {
  return { course: { course_code: code, course_name: 'Test course' }, enrollment: { attendance_percent: 90, semester: 1 }, syllabus_progress: { percent: 50, completed: 1, total: 2 }, modules: [], assignments: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('Student course request recovery', () => {
  beforeEach(() => { mocks.courseId = 'course-a'; mocks.get.mockReset(); mocks.api = { get: mocks.get }; });

  it('shows a safe failure and retries a rejected request', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Sensitive database detail')).mockResolvedValueOnce(workspace('CS101'));
    render(<StudentCourseWorkspacePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load this course');
    expect(screen.queryByText('Sensitive database detail')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All courses' })).toHaveAttribute('href', '/student/courses');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('CS101 — Test course')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it('does not show a previous course while the next course loads or use a stale response', async () => {
    const first = deferred<StudentWorkspace>();
    const second = deferred<StudentWorkspace>();
    mocks.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<StudentCourseWorkspacePage />);
    mocks.courseId = 'course-b';
    view.rerender(<StudentCourseWorkspacePage />);
    await act(async () => first.resolve(workspace('OLD101')));
    expect(screen.queryByText('OLD101 — Test course')).not.toBeInTheDocument();
    expect(screen.getByText('Loading course workspace…')).toBeInTheDocument();
    await act(async () => second.resolve(workspace('NEW101')));
    expect(screen.getByText('NEW101 — Test course')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenLastCalledWith('/api/academics/student/courses/course-b/workspace');
  });

  it('hides already loaded course data immediately when navigating to another course', async () => {
    const next = deferred<StudentWorkspace>();
    mocks.get.mockResolvedValueOnce(workspace('OLD101')).mockReturnValueOnce(next.promise);
    const view = render(<StudentCourseWorkspacePage />);
    await screen.findByText('OLD101 — Test course');
    mocks.courseId = 'course-b';
    view.rerender(<StudentCourseWorkspacePage />);
    expect(screen.queryByText('OLD101 — Test course')).not.toBeInTheDocument();
    await act(async () => next.reject(new Error('Unavailable')));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('handles a late rejected request after unmount without an unhandled rejection', async () => {
    const request = deferred<StudentWorkspace>();
    mocks.get.mockReturnValueOnce(request.promise);
    const view = render(<StudentCourseWorkspacePage />);
    view.unmount();
    await act(async () => request.reject(new Error('Request ended')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides a previous session response while the API client changes', async () => {
    const request = deferred<StudentWorkspace>();
    mocks.get.mockResolvedValueOnce(workspace('OLD101')).mockReturnValueOnce(request.promise);
    const view = render(<StudentCourseWorkspacePage />);
    await screen.findByText('OLD101 — Test course');
    mocks.api = { get: mocks.get };
    view.rerender(<StudentCourseWorkspacePage />);
    expect(screen.queryByText('OLD101 — Test course')).not.toBeInTheDocument();
    expect(screen.getByText('Loading course workspace…')).toBeInTheDocument();
    await act(async () => request.resolve(workspace('NEW101')));
    expect(screen.getByText('NEW101 — Test course')).toBeInTheDocument();
  });

  it('reloads the course after an assignment submission', async () => {
    mocks.get.mockResolvedValueOnce(workspace('CS101')).mockResolvedValueOnce(workspace('UPDATED101'));
    render(<StudentCourseWorkspacePage />);
    await screen.findByText('CS101 — Test course');
    fireEvent.click(screen.getByRole('button', { name: 'Digital assignments (DA)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit assignment' }));
    expect(await screen.findByText('UPDATED101 — Test course')).toBeInTheDocument();
  });
});
