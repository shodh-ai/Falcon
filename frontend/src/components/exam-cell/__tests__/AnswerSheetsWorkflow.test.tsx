import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnswerSheetsPage from '@/app/(portals)/exam-cell/answer-sheets/page';

const mocks = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, role: 'ExamCell', success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { primaryRole: mocks.role, role: mocks.role } }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/components/ui/select', () => ({ Select: ({ children, ...props }: ComponentProps<'select'>) => <select {...props}>{children}</select> }));
const sheet = { sheet_id: 'sheet-a', sheet_number: 'BOOK-1', status: 'ISSUED', qr_payload: 'AS|actual-scope', student_name: 'Seated Student', subject_name: 'Subject A', exam_date: '2026-10-23', exam_schedule_id: 'schedule-a', student_user_id: 'student-a', collected_at: null };
beforeEach(() => {
  vi.resetAllMocks(); mocks.role = 'ExamCell';
  mocks.api.get.mockImplementation(async (path: string) => {
    if (path === '/api/exam-cell/schedules') return [{ exam_schedule_id: 'schedule-a', subject_name: 'Subject A', exam_date: '2026-10-23' }];
    if (path === '/api/exam-cell/faculty-roster') return [{ user_id: 'faculty-a', name: 'Assigned Faculty' }];
    if (path.includes('/exam-day/roster?')) return [{ student_user_id: 'student-a', student_name: 'Seated Student' }];
    return [];
  });
  mocks.api.post.mockResolvedValue(sheet);
});

describe('existing Answer Sheets page uses scoped script operations', () => {
  it('requires an actual examination and roster student and sends both IDs when issuing a booklet', async () => {
    render(<AnswerSheetsPage />);
    await screen.findByRole('option', { name: /Subject A/ });
    expect(screen.getByRole('button', { name: 'Issue & generate QR' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Booklet examination'), { target: { value: 'schedule-a' } });
    await screen.findByRole('option', { name: 'Seated Student' });
    fireEvent.change(screen.getByLabelText('Booklet student'), { target: { value: 'student-a' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. AS-2026-001'), { target: { value: 'BOOK-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue & generate QR' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/exam-cell/answer-sheets', { sheet_number: 'BOOK-1', exam_schedule_id: 'schedule-a', student_user_id: 'student-a' }));
  });

  it('does not expose issue or lifecycle actions to the active ExamOperator', async () => {
    mocks.role = 'ExamOperator';
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/answer-sheets' ? [sheet] : []);
    render(<AnswerSheetsPage />);
    await screen.findByText('BOOK-1');
    expect(screen.queryByRole('button', { name: 'Issue & generate QR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next stage' })).not.toBeInTheDocument();
  });

  it('does not present a failed list as a genuine empty register', async () => {
    mocks.api.get.mockRejectedValue(new Error('Script register unavailable'));
    render(<AnswerSheetsPage />);
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.queryByText('No answer sheets tracked yet')).not.toBeInTheDocument();
  });

  it('keeps unverifiable legacy booklets read only', async () => {
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/answer-sheets' ? [{ ...sheet, exam_schedule_id: null, student_user_id: null }] : []);
    render(<AnswerSheetsPage />);
    await screen.findByText('BOOK-1');
    expect(screen.queryByRole('button', { name: 'Next stage' })).not.toBeInTheDocument();
    expect(screen.getByText('Read only')).toBeVisible();
  });

  it('does not claim a successful issue when the authorized API rejects it', async () => {
    mocks.api.post.mockRejectedValue(new Error('Student is outside this roster'));
    render(<AnswerSheetsPage />);
    await screen.findByRole('option', { name: /Subject A/ });
    fireEvent.change(screen.getByLabelText('Booklet examination'), { target: { value: 'schedule-a' } });
    await screen.findByRole('option', { name: 'Seated Student' });
    fireEvent.change(screen.getByLabelText('Booklet student'), { target: { value: 'student-a' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. AS-2026-001'), { target: { value: 'BOOK-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue & generate QR' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Student is outside this roster'));
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('does not offer custody advancement for a linked legacy status without a verified physical receipt', async () => {
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/answer-sheets' ? [{ ...sheet, status: 'CHECKED', collected_at: null }] : []);
    render(<AnswerSheetsPage />);
    await screen.findByText('BOOK-1');
    expect(screen.queryByRole('button', { name: 'Next stage' })).not.toBeInTheDocument();
    expect(screen.getByText('Read only')).toBeVisible();
  });
});
