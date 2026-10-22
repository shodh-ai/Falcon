import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamCellResultsPage from '@/app/(portals)/exam-cell/results/page';

const { api, toast } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const sessionA = {
  session_id: 'synthetic-session-a', course_id: 'synthetic-course-a', course_code: 'SYN-A', course_name: 'Synthetic course A',
  exam_type: 'INTERNAL', semester: 4, max_marks: 50, pass_marks: 20, entry_status: 'LOCKED', marks_locked: true,
  declared_at: null, processed_at: null, pending_coe_count: 0, report_count: 0, grading_policy_id: null,
};
const sessionB = {
  ...sessionA, session_id: 'synthetic-session-b', course_id: 'synthetic-course-b', course_code: 'SYN-B', course_name: 'Synthetic course B',
  max_marks: 100, pass_marks: 40,
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('Result Control session selection', () => {
  it('shows a detail failure, blocks entry actions, and retries the same selected session', async () => {
    let detailCalls = 0;
    api.get.mockImplementation((path: string) => {
      if (path === '/api/exam-cell/result-control/sessions') return Promise.resolve([sessionA]);
      if (path === `/api/exam-cell/result-control/sessions/${sessionA.session_id}`) {
        detailCalls += 1;
        return detailCalls === 1
          ? Promise.reject(new Error('Synthetic session details unavailable'))
          : Promise.resolve({ ...sessionA, coe_audit_status: 'idle', dean_approved: false });
      }
      return Promise.resolve([]);
    });
    render(<ExamCellResultsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /SYN-A · INTERNAL LOCKED/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic session details unavailable');
    expect(screen.getByRole('button', { name: 'Open entry' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close entry' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Push to Student Portals' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry session details' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open entry' })).toBeEnabled());
    expect(detailCalls).toBe(2);
    expect(screen.getByPlaceholderText('Pass marks')).toHaveValue('20');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('clears the previous session rules and approval while the next detail is loading', async () => {
    const nextDetail = deferred<object>();
    api.get.mockImplementation((path: string) => {
      if (path === '/api/exam-cell/result-control/sessions') return Promise.resolve([sessionA, sessionB]);
      if (path === `/api/exam-cell/result-control/sessions/${sessionA.session_id}`) {
        return Promise.resolve({ ...sessionA, coe_audit_status: 'passed', dean_approved: true });
      }
      if (path === `/api/exam-cell/result-control/sessions/${sessionB.session_id}`) return nextDetail.promise;
      return Promise.resolve([]);
    });
    render(<ExamCellResultsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /SYN-A · INTERNAL LOCKED/ }));
    expect(await screen.findByText('Dean/VC Approved')).toBeTruthy();
    expect(screen.getByPlaceholderText('Pass marks')).toHaveValue('20');

    fireEvent.click(screen.getByRole('button', { name: /SYN-B · INTERNAL LOCKED/ }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(`/api/exam-cell/result-control/sessions/${sessionB.session_id}`));
    expect(screen.queryByText('Dean/VC Approved')).toBeNull();
    expect(screen.queryByText('Audit passed')).toBeNull();
    expect(screen.getByText('Pending Dean/VC Signature')).toBeTruthy();
    expect(screen.getByPlaceholderText('Pass marks')).toHaveValue('');
    expect(screen.getByPlaceholderText('Max marks')).toHaveValue('');

    await act(async () => { nextDetail.resolve({ ...sessionB, coe_audit_status: 'idle', dean_approved: false }); });
    expect(screen.getByPlaceholderText('Pass marks')).toHaveValue('40');
    expect(screen.getByPlaceholderText('Max marks')).toHaveValue('100');
  });

  it('does not apply a previous session detail or approval after the staff member switches sessions', async () => {
    const firstDetail = deferred<object>();
    const nextDetail = deferred<object>();
    api.get.mockImplementation((path: string) => {
      if (path === '/api/exam-cell/result-control/sessions') return Promise.resolve([sessionA, sessionB]);
      if (path === `/api/exam-cell/result-control/sessions/${sessionA.session_id}`) return firstDetail.promise;
      if (path === `/api/exam-cell/result-control/sessions/${sessionB.session_id}`) return nextDetail.promise;
      return Promise.resolve([]);
    });
    render(<ExamCellResultsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /SYN-A · INTERNAL LOCKED/ }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(`/api/exam-cell/result-control/sessions/${sessionA.session_id}`));
    fireEvent.click(screen.getByRole('button', { name: /SYN-B · INTERNAL LOCKED/ }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(`/api/exam-cell/result-control/sessions/${sessionB.session_id}`));

    await act(async () => {
      nextDetail.resolve({ ...sessionB, pass_marks: 45, max_marks: 100, coe_audit_status: 'anomaly', dean_approved: false });
    });
    expect(screen.getByText('Declare results — SYN-B · INTERNAL')).toBeTruthy();
    expect(screen.getByPlaceholderText('Pass marks')).toHaveValue('45');
    expect(screen.getByPlaceholderText('Max marks')).toHaveValue('100');
    expect(screen.getByText('Pending Dean/VC Signature')).toBeTruthy();
    expect(screen.getByText('Anomaly detected')).toBeTruthy();

    await act(async () => {
      firstDetail.resolve({ ...sessionA, pass_marks: 25, max_marks: 50, coe_audit_status: 'passed', dean_approved: true });
    });
    expect(screen.getByPlaceholderText('Pass marks')).toHaveValue('45');
    expect(screen.getByPlaceholderText('Max marks')).toHaveValue('100');
    expect(screen.getByText('Pending Dean/VC Signature')).toBeTruthy();
    expect(screen.queryByText('Dean/VC Approved')).toBeNull();
    expect(screen.getByText('Anomaly detected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Push to Student Portals' })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
