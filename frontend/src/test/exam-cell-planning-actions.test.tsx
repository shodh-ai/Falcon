import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SelectHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamCellSchedulePage from '@/app/(portals)/exam-cell/schedule/page';
import ExamCellQuestionPapersPage from '@/app/(portals)/exam-cell/question-papers/page';

const { api, toast } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { roles: ['examcell'] } }) }));
vi.mock('@/components/ui/select', () => ({
  Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
}));

const paper = {
  qp_id: 'synthetic-paper', has_file: true, version_number: 1, subject_name: 'Synthetic subject', subject_code: 'SYN101', exam_date: null,
  exam_type: null, setter_name: null, status: 'UPLOADED', notes: null, created_at: '2026-10-19T00:00:00Z',
};

beforeEach(() => {
  api.get.mockReset().mockImplementation((path: string) => Promise.resolve(
    path === '/api/exam-cell/subjects'
      ? [{ subject_id: 1, subject_code: 'SYN101', subject_name: 'Synthetic subject', semester: 4 }]
      : path === '/api/exam-cell/question-papers' ? [paper] : path === '/api/exam-cell/schedules' ? [{ exam_schedule_id: 'synthetic-exam', subject_name: 'Synthetic subject', exam_date: '2026-11-01', exam_type: 'END_TERM' }] : [],
  ));
  api.post.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
});

describe('Examination planning actions', () => {
  it('submits one schedule for two clicks in the same tick and waits for API success', async () => {
    let finishCreate!: (value: object) => void;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { finishCreate = resolve; }));
    render(<ExamCellSchedulePage />);
    await screen.findByRole('option', { name: 'SYN101 — Synthetic subject (Sem 4)' });
    fireEvent.change(screen.getByLabelText('Exam date'), { target: { value: '2026-11-01' } });
    const add = screen.getByRole('button', { name: 'Add to schedule' });
    act(() => { fireEvent.click(add); fireEvent.click(add); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Adding to schedule…' })).toBeDisabled();
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => { finishCreate({}); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to schedule' })).toBeEnabled());
    expect(api.post).toHaveBeenCalledWith('/api/exam-cell/schedules', expect.objectContaining({ subject_id: 1, exam_date: '2026-11-01' }));
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('advances a question paper once for two clicks in the same tick', async () => {
    let finishUpdate!: (value: object) => void;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { finishUpdate = resolve; }));
    render(<ExamCellQuestionPapersPage />);
    const advance = await screen.findByRole('button', { name: 'Send to moderation' });
    act(() => { fireEvent.click(advance); fireEvent.click(advance); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Send to moderation' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add record' })).toBeDisabled();
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => { finishUpdate({}); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to moderation' })).toBeEnabled());
    expect(api.post).toHaveBeenCalledWith('/api/exam-cell/question-papers/synthetic-paper/status', { status: 'UNDER_MODERATION' });
    expect(toast.success).toHaveBeenCalledWith('Workflow stage saved');
  });

  it('restores question paper actions on failure without a success message', async () => {
    api.post.mockRejectedValueOnce(new Error('Status update unavailable'));
    render(<ExamCellQuestionPapersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send to moderation' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Status update unavailable'));
    expect(screen.getByRole('button', { name: 'Send to moderation' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Examination schedule'), { target: { value: 'synthetic-exam' } });
    expect(screen.getByRole('button', { name: 'Add record' })).toBeEnabled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
