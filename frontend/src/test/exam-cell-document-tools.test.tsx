import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamCellDocumentsPage from '@/app/(portals)/exam-cell/documents/page';

const { api, toast } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  api.post.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  api.get.mockReset().mockImplementation((path: string) => {
    if (path === '/api/exam-cell/document-repository') {
      return Promise.resolve([{ repository_id: 'notice-1', title: 'Synthetic examination notice', category: 'NOTICE', file_url: null, created_at: '2026-10-19T09:00:00Z' }]);
    }
    if (path === '/api/exam-cell/student-documents') {
      return Promise.resolve([{ doc_id: 'doc-1', student_name: 'Synthetic document student', enrollment_number: 'SYNTH-01', document_type: 'EXAM_ELIGIBILITY', verification_status: 'PENDING' }]);
    }
    if (path === '/api/exam-cell/workflows') {
      return Promise.resolve([{ workflow_id: 'workflow-1', workflow_name: 'Synthetic hall ticket approval', workflow_key: 'HALL_TICKET', steps: [], is_active: true }]);
    }
    return Promise.reject(new Error(`Unexpected document request: ${path}`));
  });
});

describe('Examination Cell document tools', () => {
  it('keeps repository content and actions under a compact, named tab list', async () => {
    render(<ExamCellDocumentsPage />);
    expect(await screen.findByText('Synthetic examination notice')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Examination Document Repository' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Document tools' })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Add to repository' })).toBeTruthy();
    expect(screen.queryByText('Three tabs:')).toBeNull();
    expect(api.get.mock.calls.map(([path]) => path)).toEqual([
      '/api/exam-cell/document-repository',
      '/api/exam-cell/student-documents',
      '/api/exam-cell/workflows',
    ]);
  });

  it('preserves student verification and workflow panels when switching tabs', async () => {
    render(<ExamCellDocumentsPage />);
    await screen.findByText('Synthetic examination notice');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Student document verification' }), { button: 0, ctrlKey: false });
    expect(await screen.findByText('Synthetic document student')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Workflow definitions' }), { button: 0, ctrlKey: false });
    expect(await screen.findByText('Synthetic hall ticket approval')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Workflow definitions' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Document repository' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByText('Synthetic examination notice')).toBeTruthy());
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('shows a failed bundle as an error in every tab and retries without false empty states', async () => {
    api.get.mockRejectedValue(new Error('Synthetic documents unavailable'));
    render(<ExamCellDocumentsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic documents unavailable');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Student document verification' }), { button: 0, ctrlKey: false });
    expect(screen.queryByText('No student examination documents pending verification.')).toBeNull();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Workflow definitions' }), { button: 0, ctrlKey: false });
    expect(screen.queryByText('No active workflow definitions configured.')).toBeNull();
    api.get.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry documents' }));
    expect(await screen.findByText('No active workflow definitions configured.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('guards duplicate repository writes and permits deliberate retry after an error', async () => {
    const save = deferred<object>();
    api.post.mockReturnValueOnce(save.promise).mockResolvedValueOnce({ repository_id: 'new' });
    render(<ExamCellDocumentsPage />);
    await screen.findByText('Synthetic examination notice');
    fireEvent.change(screen.getByLabelText('Document title'), { target: { value: 'Synthetic new notice' } });
    const add = screen.getByRole('button', { name: 'Add to repository' });
    await act(async () => { fireEvent.click(add); fireEvent.click(add); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/api/exam-cell/document-repository', { title: 'Synthetic new notice', category: 'NOTICE', file_url: '' });
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => save.reject(new Error('Synthetic document save failure')));
    expect(screen.getByLabelText('Document title')).toHaveValue('Synthetic new notice');
    fireEvent.click(screen.getByRole('button', { name: 'Add to repository' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(6));
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('sends only one verification action while a document decision is pending', async () => {
    api.post.mockReturnValue(new Promise(() => {}));
    render(<ExamCellDocumentsPage />);
    await screen.findByText('Synthetic examination notice');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Student document verification' }), { button: 0, ctrlKey: false });
    const verify = screen.getByRole('button', { name: 'Verify' });
    const reject = screen.getByRole('button', { name: 'Reject' });
    await act(async () => { fireEvent.click(verify); fireEvent.click(reject); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/api/exam-cell/student-documents/doc-1/verify', { status: 'VERIFIED' });
    expect(verify).toBeDisabled();
    expect(reject).toBeDisabled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('ignores the obsolete initial read after a successful write has refreshed the repository', async () => {
    const old = deferred<object[]>();
    let reads = 0;
    api.get.mockImplementation((path: string) => {
      reads += 1;
      if (reads <= 3) return old.promise;
      return Promise.resolve(path.endsWith('/document-repository') ? [{ repository_id: 'new', title: 'Current repository notice', category: 'NOTICE', file_url: null, created_at: '2026-10-21T09:00:00Z' }] : []);
    });
    api.post.mockResolvedValue({ repository_id: 'new' });
    render(<ExamCellDocumentsPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
    fireEvent.change(screen.getByLabelText('Document title'), { target: { value: 'Current repository notice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to repository' }));
    await screen.findByText('Current repository notice');
    await act(async () => old.resolve([]));
    expect(screen.getByText('Current repository notice')).toBeTruthy();
    expect(screen.queryByText('No examination documents in the repository.')).toBeNull();
  });
});
