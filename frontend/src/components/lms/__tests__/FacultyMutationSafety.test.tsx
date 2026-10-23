import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FacultyAssignmentsTab } from '../FacultyAssignmentsTab';
import { FacultyAnnouncementsTab } from '../FacultyAnnouncementsTab';
import { FacultyMaterialsTab } from '../FacultyMaterialsTab';
import type { FacultyWorkspace } from '@/lib/api/lms';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), del: vi.fn() },
  auth: { user: { user_id: 'faculty-1' }, token: 'token-1' },
  multipart: vi.fn(), patchMultipart: vi.fn(), toast: { success: vi.fn(), error: vi.fn() }, refresh: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => fixtures.auth }));
vi.mock('@/lib/api/lms', () => ({ postMultipart: (...args: unknown[]) => fixtures.multipart(...args), patchMultipart: (...args: unknown[]) => fixtures.patchMultipart(...args), downloadWithAuth: vi.fn() }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/lib/faculty-demo-mode', () => ({ withFacultyDemoFallback: (live: unknown) => live, isEmptyArray: (rows: unknown[]) => !rows.length, isFacultyDemoEntityId: () => false, isFacultyDemoSmokeId: () => false }));
vi.mock('@/components/faculty', () => ({
  FacultyPanel: ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  FacultyEmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  FacultyErrorBanner: ({ message }: { message: string }) => <p role="alert">{message}</p>,
  FacultyInlineLoading: ({ label }: { label: string }) => <p role="status">{label}</p>,
}));
const assignment = { assignment_id: 'assignment-a', title: 'Synthetic Assignment A', start_date: '2020-01-01T00:00:00Z', due_date: '2099-01-01T00:00:00Z', max_marks: 10 };
const roster = { roster: [{ student_user_id: 'student-1', student_name: 'Synthetic Student', submission_id: 'submission-1', submitted: true, marks_awarded: null, status: 'SUBMITTED' }] };
const workspace: FacultyWorkspace = { course: { course_id: 'course-a', course_code: 'SYN101', course_name: 'Synthetic Course', credits: 3 }, syllabus_configured: true, modules: [{ module_id: 'module-a', module_number: 1, title: 'Synthetic Unit', status: 'PENDING', materials: [] }] };
const targets = { course: workspace.course, cross_section_available: false, targets: [] };
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn().mockResolvedValue({}), del: vi.fn().mockResolvedValue({}) };
  fixtures.auth = { user: { user_id: 'faculty-1' }, token: 'token-1' };
  fixtures.multipart.mockReset().mockResolvedValue({}); fixtures.patchMultipart.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

describe('assignment mutation scope', () => {
  it('locks the current roster and Back action while one mark save is pending', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('/roster') ? roster : [assignment]);
    let resolve!: () => void;
    fixtures.api.post.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    render(<FacultyAssignmentsTab courseId="course-a" />);
    fireEvent.click(await screen.findByRole('button', { name: /Synthetic Assignment A/ }));
    await screen.findByText('Synthetic Student');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    const save = screen.getByRole('button', { name: 'Save marks' });
    act(() => { fireEvent.click(save); fireEvent.click(save); });
    expect(fixtures.api.post).toHaveBeenCalledExactlyOnceWith('/api/academics/faculty/submissions/submission-1/grade', { marks_awarded: 5 });
    expect(screen.getByRole('button', { name: /Back to assignments/ })).toBeDisabled();
    expect(screen.getByRole('spinbutton')).toBeDisabled();
    expect(screen.getByPlaceholderText('Return remarks (required)')).toBeDisabled();
    await act(async () => { resolve(); });
    await waitFor(() => expect(screen.getByRole('button', { name: /Back to assignments/ })).toBeEnabled());
  });

  it('never reopens an old roster or emits success after an account switch during grading', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('/roster') ? roster : [assignment]);
    let resolve!: () => void;
    const oldApi = fixtures.api;
    oldApi.post.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    const view = render(<FacultyAssignmentsTab courseId="course-a" />);
    fireEvent.click(await screen.findByRole('button', { name: /Synthetic Assignment A/ }));
    await screen.findByText('Synthetic Student');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save marks' }));
    fixtures.api = { get: vi.fn().mockResolvedValue([{ ...assignment, assignment_id: 'assignment-b', title: 'New account assignment' }]), post: vi.fn(), del: vi.fn() };
    fixtures.auth = { user: { user_id: 'faculty-2' }, token: 'token-2' };
    view.rerender(<FacultyAssignmentsTab courseId="course-a" />);
    await screen.findByRole('button', { name: /New account assignment/ });
    await act(async () => { resolve(); });
    expect(screen.queryByText('Synthetic Student')).not.toBeInTheDocument();
    expect(oldApi.get).toHaveBeenCalledTimes(2);
    expect(fixtures.toast.success).not.toHaveBeenCalled();
  });

  it('guards assignment creation, locks inputs/cancel and retains its draft on failure', async () => {
    let reject!: (error: Error) => void;
    fixtures.multipart.mockReturnValue(new Promise((_done, fail) => { reject = fail; }));
    const { container } = render(<FacultyAssignmentsTab courseId="course-a" />);
    await screen.findByText('No digital assignments yet');
    fireEvent.click(screen.getByRole('button', { name: 'Create DA' }));
    const title = screen.getByPlaceholderText('e.g. Linked List Implementation');
    fireEvent.change(title, { target: { value: 'Synthetic draft' } });
    const dates = container.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(dates[0], { target: { value: '2098-01-01T10:00' } });
    fireEvent.change(dates[1], { target: { value: '2099-01-01T10:00' } });
    act(() => { fireEvent.submit(title.closest('form')!); fireEvent.submit(title.closest('form')!); });
    expect(fixtures.multipart).toHaveBeenCalledTimes(1);
    expect(title).toBeDisabled(); expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => { reject(new Error('Synthetic create offline')); });
    expect(title).toHaveValue('Synthetic draft');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});

describe('announcement mutation scope', () => {
  it('locks drafts, guards duplicate publication and preserves a failed message', async () => {
    let reject!: (error: Error) => void;
    fixtures.api.post.mockReturnValue(new Promise((_done, fail) => { reject = fail; }));
    render(<FacultyAnnouncementsTab courseId="course-a" />);
    await screen.findByText('No announcements yet');
    const title = screen.getByPlaceholderText('Announcement title');
    const body = screen.getByPlaceholderText('Message for students');
    fireEvent.change(title, { target: { value: 'Synthetic notice' } }); fireEvent.change(body, { target: { value: 'Synthetic message' } });
    act(() => { fireEvent.submit(title.closest('form')!); fireEvent.submit(title.closest('form')!); });
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
    expect(title).toBeDisabled(); expect(body).toBeDisabled();
    await act(async () => { reject(new Error('Synthetic publish offline')); });
    expect(title).toHaveValue('Synthetic notice'); expect(body).toHaveValue('Synthetic message');
  });

  it('does not clear a new account announcement draft when an old POST finishes', async () => {
    let resolve!: () => void;
    const oldApi = fixtures.api;
    oldApi.post.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    const view = render(<FacultyAnnouncementsTab courseId="course-a" />);
    await screen.findByText('No announcements yet');
    fireEvent.change(screen.getByPlaceholderText('Announcement title'), { target: { value: 'Old notice' } });
    fireEvent.change(screen.getByPlaceholderText('Message for students'), { target: { value: 'Old message' } });
    fireEvent.submit(screen.getByPlaceholderText('Announcement title').closest('form')!);
    fixtures.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn(), del: vi.fn() };
    fixtures.auth = { user: { user_id: 'faculty-2' }, token: 'token-2' };
    view.rerender(<FacultyAnnouncementsTab courseId="course-a" />);
    await screen.findByText('No announcements yet');
    fireEvent.change(screen.getByPlaceholderText('Announcement title'), { target: { value: 'New account draft' } });
    await act(async () => { resolve(); });
    expect(screen.getByPlaceholderText('Announcement title')).toHaveValue('New account draft');
    expect(oldApi.get).toHaveBeenCalledTimes(1); expect(fixtures.toast.success).not.toHaveBeenCalled();
  });
});

describe('material upload draft ownership', () => {
  it('keeps a selected file when retrying a failed publishing-section read', async () => {
    fixtures.api.get.mockRejectedValueOnce(new Error('Sections offline')).mockResolvedValueOnce(targets);
    const { container } = render(<FacultyMaterialsTab courseId="course-a" workspace={workspace} onRefresh={fixtures.refresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload notes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sections offline');
    const inputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(inputs[inputs.length - 1], { target: { files: [new File(['synthetic'], 'notes.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry sections' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('notes.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload 1' })).toBeEnabled();
  });

  it('locks upload/cancel/other material actions and ignores stale account completion', async () => {
    fixtures.api.get.mockResolvedValue(targets);
    let resolve!: () => void;
    fixtures.multipart.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    const view = render(<FacultyMaterialsTab courseId="course-a" workspace={workspace} onRefresh={fixtures.refresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload notes' }));
    await waitFor(() => expect(screen.queryByText('Loading sections…')).not.toBeInTheDocument());
    const inputs = view.container.querySelectorAll('input[type="file"]');
    fireEvent.change(inputs[inputs.length - 1], { target: { files: [new File(['synthetic'], 'notes.pdf', { type: 'application/pdf' })] } });
    const upload = screen.getByRole('button', { name: 'Upload 1' });
    act(() => { fireEvent.submit(upload.closest('form')!); fireEvent.submit(upload.closest('form')!); });
    expect(fixtures.multipart).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(screen.getByPlaceholderText('e.g. Unit 1 Notes')).toBeDisabled();
    fixtures.api = { get: vi.fn().mockResolvedValue(targets), post: vi.fn(), del: vi.fn() };
    fixtures.auth = { user: { user_id: 'faculty-2' }, token: 'token-2' };
    view.rerender(<FacultyMaterialsTab courseId="course-a" workspace={workspace} onRefresh={fixtures.refresh} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Unit 1 — Introduction'), { target: { value: 'New account unit draft' } });
    await act(async () => { resolve(); });
    expect(screen.getByPlaceholderText('e.g. Unit 1 — Introduction')).toHaveValue('New account unit draft');
    expect(fixtures.refresh).not.toHaveBeenCalled(); expect(fixtures.toast.success).not.toHaveBeenCalled();
  });
});
