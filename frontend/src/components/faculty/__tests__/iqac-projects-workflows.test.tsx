import React, { type ReactNode, type SelectHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IqacPage from '@/app/(portals)/faculty/iqac/page';
import ProjectsPage from '@/app/(portals)/faculty/projects/page';

const fixture = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixture.api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: fixture.success, error: fixture.error } }));
vi.mock('sonner', () => ({ toast: { success: fixture.success, error: fixture.error } }));
vi.mock('@/lib/faculty-demo-mode', () => ({
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  isFacultyDemoEntityId: () => false, isFacultyDemoSmokeId: () => false,
  withFacultyDemoFallback: (live: unknown) => live,
}));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/components/faculty', () => ({
  FacultyPageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  FacultyPageHeader: ({ title, actions }: { title: string; actions?: ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
  FacultyPanel: ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  FacultyMetricChip: () => null,
  FacultyPageLoading: ({ label }: { label: string }) => <p role="status">{label}</p>,
  FacultyEmptyState: ({ description }: { description: string }) => <p>{description}</p>,
  FacultyErrorBanner: ({ message }: { message: string }) => <p role="alert">{message}</p>,
}));
vi.mock('@/components/ui/dialog', async () => {
  const { createContext, useContext } = await import('react');
  const Context = createContext(false);
  return {
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => <Context.Provider value={open}>{children}</Context.Provider>,
    DialogContent: ({ children }: { children: ReactNode }) => useContext(Context) ? <div role="dialog">{children}</div> : null,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

const task = { assignment_id: 'task-1', status: 'OPEN', task: { task_name: 'First task' }, submissions: [] };
const project = { guide_id: 'guide-1', project_title: 'First project', program: 'B.Pharm', status: 'ACTIVE', start_date: null, end_date: null, funding_allocated: 0, funding_consumed: 0, students: [], funding_requests: [] };
const directoryStudent = { user_id: 'student-1', name: 'Test Student', official_email: 'student@example.test', department_name: 'Pharmacy', batch: '2026' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function selectEvidence(container: HTMLElement) {
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(['test'], 'evidence.pdf', { type: 'application/pdf' })] },
  });
}

async function createDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  const dialog = within(await screen.findByRole('dialog'));
  fireEvent.change(dialog.getByPlaceholderText('e.g. AI Based Surveillance System'), { target: { value: 'New project' } });
  return dialog;
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.api = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
  fixture.api.get.mockImplementation(async (path: string) => path === '/tasks/assignments/my'
    ? [task] : path.includes('/projects') ? [project] : { items: [directoryStudent] });
  fixture.api.post.mockResolvedValue({ path: '/uploads/evidence.pdf' });
  fixture.api.patch.mockResolvedValue({});
});
afterEach(cleanup);

describe('IQAC task reads and evidence submission', () => {
  it('shows a persistent load error and retries without claiming no tasks exist', async () => {
    fixture.api.get.mockRejectedValueOnce(new Error('Tasks unavailable')).mockResolvedValueOnce([]);
    render(<IqacPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Tasks unavailable');
    expect(screen.queryByText('No IQAC tasks assigned.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry IQAC tasks' }));
    expect(await screen.findByText('No IQAC tasks assigned.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the selected evidence and task after a failed submission', async () => {
    fixture.api.post.mockImplementation(async (path: string) => {
      if (path === '/uploads/single') return { path: '/uploads/evidence.pdf' };
      throw new Error('Submission unavailable');
    });
    const { container } = render(<IqacPage />);
    await screen.findByRole('button', { name: /First task/ });
    selectEvidence(container);
    fireEvent.click(screen.getByRole('button', { name: 'Submit to HOD' }));
    await waitFor(() => expect(fixture.error).toHaveBeenCalledWith('Submission unavailable'));
    expect(screen.getByText('Selected file: evidence.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit to HOD' })).toBeEnabled();
  });

  it('locks the file and task selectors while an upload is pending and posts once', async () => {
    const upload = deferred<{ path: string }>();
    fixture.api.post.mockReturnValueOnce(upload.promise);
    const { container } = render(<IqacPage />);
    const taskButton = await screen.findByRole('button', { name: /First task/ });
    selectEvidence(container);
    const submit = screen.getByRole('button', { name: 'Submit to HOD' });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(fixture.api.post).toHaveBeenCalledTimes(1);
    expect(taskButton).toBeDisabled();
    expect(container.querySelector('input[type="file"]')).toBeDisabled();
    upload.resolve({ path: '/uploads/evidence.pdf' });
    await waitFor(() => expect(fixture.success).toHaveBeenCalledWith('Evidence submitted to your HOD for review'));
  });

  it('keeps a confirmed successful submission distinct from a later refresh failure', async () => {
    const { container } = render(<IqacPage />);
    await screen.findByRole('button', { name: /First task/ });
    fixture.api.get.mockRejectedValue(new Error('Refresh unavailable'));
    selectEvidence(container);
    fireEvent.click(screen.getByRole('button', { name: 'Submit to HOD' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(fixture.success).toHaveBeenCalledWith('Evidence submitted to your HOD for review');
    expect(fixture.error).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /First task/ })).toBeInTheDocument();
    expect(screen.queryByText('Selected file: evidence.pdf')).not.toBeInTheDocument();
  });

  it('ignores a late task response from a previous authenticated API', async () => {
    const oldRead = deferred<unknown[]>();
    fixture.api.get.mockReturnValueOnce(oldRead.promise);
    const view = render(<IqacPage />);
    fixture.api = { get: vi.fn().mockResolvedValue([{ ...task, assignment_id: 'new-task', task: { task_name: 'New account task' } }]), post: vi.fn(), patch: vi.fn() };
    view.rerender(<IqacPage />);
    await screen.findByRole('button', { name: /New account task/ });
    oldRead.resolve([task]);
    await waitFor(() => expect(screen.queryByRole('button', { name: /First task/ })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /New account task/ })).toBeInTheDocument();
  });

  it('does not continue a previous account upload into a task submission after the account changes', async () => {
    const upload = deferred<{ path: string }>();
    const oldApi = fixture.api;
    oldApi.post.mockReturnValueOnce(upload.promise);
    const view = render(<IqacPage />);
    await screen.findByRole('button', { name: /First task/ });
    selectEvidence(view.container);
    fireEvent.click(screen.getByRole('button', { name: 'Submit to HOD' }));
    fixture.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn(), patch: vi.fn() };
    view.rerender(<IqacPage />);
    await screen.findByText('No IQAC tasks assigned.');
    upload.resolve({ path: '/uploads/old-account.pdf' });
    await waitFor(() => expect(oldApi.post).toHaveBeenCalledTimes(1));
    expect(fixture.api.post).not.toHaveBeenCalled();
    expect(fixture.success).not.toHaveBeenCalled();
  });

  it.each(['ACCEPTED', 'CLOSED', 'WAIVED', 'PENDING_HOD_APPROVAL', 'PENDING_IQAC_REVIEW'])(
    'disables evidence submission for %s tasks', async status => {
      fixture.api.get.mockResolvedValue([{ ...task, status }]);
      const { container } = render(<IqacPage />);
      await screen.findByRole('button', { name: /First task/ });
      expect(container.querySelector('input[type="file"]')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Submit to HOD' })).toBeDisabled();
      expect(fixture.api.post).not.toHaveBeenCalled();
    },
  );
});

describe('Projects and Labs independent data and save states', () => {
  it('retries a failed project list without rendering a successful empty state', async () => {
    fixture.api.get.mockImplementation(async (path: string) => {
      if (path.includes('/projects')) throw new Error('Projects unavailable');
      return { items: [directoryStudent] };
    });
    render(<ProjectsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Projects unavailable');
    expect(screen.queryByText('No guided projects assigned currently.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Project' })).toBeDisabled();
    fixture.api.get.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry projects' }));
    expect(await screen.findByText('No guided projects assigned currently.')).toBeInTheDocument();
  });

  it('keeps loaded projects when the student directory fails and derives filters from the real roster', async () => {
    fixture.api.get.mockImplementation(async (path: string) => {
      if (path.includes('/projects')) return [project];
      throw new Error('Directory unavailable');
    });
    render(<ProjectsPage />);
    expect(await screen.findByText('First project')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Directory unavailable');
    fixture.api.get.mockResolvedValueOnce({ items: [directoryStudent] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry student directory' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit Students & Grades' }));
    expect(screen.getByRole('combobox', { name: 'Filter students by department' })).toHaveTextContent('Pharmacy');
    expect(screen.getByRole('combobox', { name: 'Filter students by year' })).toHaveTextContent('2026');
  });

  it('locks create controls and sends one project request while saving', async () => {
    const save = deferred<unknown>();
    fixture.api.post.mockReturnValueOnce(save.promise);
    render(<ProjectsPage />);
    await screen.findByText('First project');
    const dialog = await createDialog();
    fireEvent.change(dialog.getByRole('textbox', { name: 'Project program' }), { target: { value: 'B.Pharm' } });
    const button = dialog.getByRole('button', { name: 'Create Project' });
    fireEvent.click(button); fireEvent.click(button);
    expect(fixture.api.post).toHaveBeenCalledTimes(1);
    expect(fixture.api.post).toHaveBeenCalledWith('/api/academics/faculty/workspaces/projects/assign', expect.objectContaining({ program: 'B.Pharm' }));
    expect(dialog.getByPlaceholderText('e.g. AI Based Surveillance System')).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    save.resolve({ guide_id: 'new-guide' });
    await waitFor(() => expect(fixture.success).toHaveBeenCalledWith('Project created successfully'));
  });

  it('preserves a failed project draft and leaves it available for retry', async () => {
    fixture.api.post.mockRejectedValueOnce(new Error('Create unavailable'));
    render(<ProjectsPage />);
    await screen.findByText('First project');
    const dialog = await createDialog();
    fireEvent.click(dialog.getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(fixture.error).toHaveBeenCalledWith('Create unavailable'));
    expect(dialog.getByPlaceholderText('e.g. AI Based Surveillance System')).toHaveValue('New project');
    expect(dialog.getByRole('button', { name: 'Create Project' })).toBeEnabled();
  });

  it('reports a confirmed project save correctly even when the list refresh fails', async () => {
    render(<ProjectsPage />);
    await screen.findByText('First project');
    const dialog = await createDialog();
    fixture.api.get.mockRejectedValue(new Error('Refresh unavailable'));
    fireEvent.click(dialog.getByRole('button', { name: 'Create Project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(fixture.success).toHaveBeenCalledWith('Project created successfully');
    expect(fixture.error).not.toHaveBeenCalled();
    expect(screen.getByText('First project')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('preserves funding values on failure and blocks repeated funding submissions', async () => {
    const save = deferred<unknown>();
    fixture.api.post.mockReturnValueOnce(save.promise);
    render(<ProjectsPage />);
    await screen.findByText('First project');
    fireEvent.click(screen.getByRole('button', { name: 'Request Funding' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByPlaceholderText('e.g. 5000'), { target: { value: '500' } });
    fireEvent.change(dialog.getByPlaceholderText('Hardware components, cloud credits, etc.'), { target: { value: 'Lab supplies' } });
    const submit = dialog.getByRole('button', { name: 'Submit Request' });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(fixture.api.post).toHaveBeenCalledTimes(1);
    expect(dialog.getByPlaceholderText('e.g. 5000')).toBeDisabled();
    save.reject(new Error('Funding unavailable'));
    await waitFor(() => expect(fixture.error).toHaveBeenCalledWith('Funding unavailable'));
    expect(dialog.getByPlaceholderText('e.g. 5000')).toHaveValue(500);
    expect(dialog.getByPlaceholderText('Hardware components, cloud credits, etc.')).toHaveValue('Lab supplies');
  });

  it('sends one completion request and disables other project mutations until it finishes', async () => {
    const save = deferred<unknown>();
    fixture.api.patch.mockReturnValueOnce(save.promise);
    render(<ProjectsPage />);
    await screen.findByText('First project');
    const complete = screen.getByRole('button', { name: 'Mark Completed' });
    fireEvent.click(complete); fireEvent.click(complete);
    expect(fixture.api.patch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Edit Students & Grades' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Request Funding' })).toBeDisabled();
    save.resolve({});
    await waitFor(() => expect(fixture.success).toHaveBeenCalledWith('Project marked as completed'));
  });

  it('does not let a previous account project response replace the current account roster', async () => {
    const oldRead = deferred<unknown[]>();
    fixture.api.get.mockImplementation((path: string) => path.includes('/projects') ? oldRead.promise : Promise.resolve({ items: [] }));
    const view = render(<ProjectsPage />);
    fixture.api = { get: vi.fn().mockImplementation(async (path: string) => path.includes('/projects') ? [{ ...project, guide_id: 'new-guide', project_title: 'New account project' }] : { items: [] }), post: vi.fn(), patch: vi.fn() };
    view.rerender(<ProjectsPage />);
    await screen.findByText('New account project');
    oldRead.resolve([project]);
    await waitFor(() => expect(screen.queryByText('First project')).not.toBeInTheDocument());
    expect(screen.getByText('New account project')).toBeInTheDocument();
  });

  it('locks student edits and submits one roster replacement while saving', async () => {
    const save = deferred<unknown>();
    fixture.api.patch.mockReturnValueOnce(save.promise);
    render(<ProjectsPage />);
    await screen.findByText('First project');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Students & Grades' }));
    const dialog = within(screen.getByRole('dialog'));
    const submit = dialog.getByRole('button', { name: 'Save Selection' });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(fixture.api.patch).toHaveBeenCalledExactlyOnceWith('/api/academics/faculty/workspaces/projects/guide-1/students', { students: [] });
    expect(dialog.getByPlaceholderText('Search students by name or email...')).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    save.resolve({});
    await waitFor(() => expect(fixture.success).toHaveBeenCalledWith('Students and grades updated successfully'));
  });
});
