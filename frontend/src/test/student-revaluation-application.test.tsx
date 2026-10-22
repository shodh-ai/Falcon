import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentExamsPage from '@/app/(portals)/student/exams/page';

const { examsApi, academicsApi, api, user } = vi.hoisted(() => ({
  examsApi: { schedule: vi.fn(), eligibility: vi.fn(), myApplications: vi.fn(), apply: vi.fn(), reEvaluationSources: vi.fn() },
  academicsApi: { studentResults: vi.fn() }, api: { get: vi.fn() }, user: { user_id: 'synthetic-student' },
}));
vi.mock('@/lib/api/api.exams', () => ({ examsApi }));
vi.mock('@/lib/api/api.academics', () => ({ academicsApi }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'synthetic-token', user }) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('intent=revaluation') }));
vi.mock('@/lib/student-demo-mode', () => ({ isStudentDemoModeEnabled: () => false }));

beforeEach(() => {
  examsApi.schedule.mockResolvedValue([]);
  examsApi.eligibility.mockResolvedValue({ eligible: true, attendance_percent: 100, reasons: [] });
  examsApi.myApplications.mockReset().mockResolvedValue([]);
  examsApi.apply.mockReset();
  examsApi.reEvaluationSources.mockReset().mockResolvedValue([{ result_id: 'synthetic-result', session_id: 'synthetic-session', subject_id: 362, subject_name: 'Synthetic subject', subject_code: 'SYN-362', exam_type: 'END_TERM', semester: 4, marks_obtained: 42, max_marks: 50 }]);
  api.get.mockResolvedValue({ seating: [] });
});

describe('Student revaluation application', () => {
  it('shows actual subject names and codes without hiding results after the sixth subject', async () => {
    examsApi.reEvaluationSources.mockResolvedValue(Array.from({ length: 7 }, (_, index) => ({
      result_id: `synthetic-result-${index}`, session_id: `synthetic-session-${index}`, subject_id: 362 + index, semester: 4, exam_type: 'END_TERM', marks_obtained: 42, max_marks: 50,
      subject_name: `Synthetic subject ${index + 1}`, subject_code: `SYN-${index + 1}`,
    })));
    render(<StudentExamsPage />);
    expect(await screen.findByText('Synthetic subject 7')).toBeTruthy();
    expect(screen.getByText(/SYN-7 · END TERM/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Apply for/ })).toHaveLength(7);
    expect(screen.queryByText('Subject #368')).toBeNull();
  });

  it('submits only once while application creation is pending', async () => {
    examsApi.apply.mockReturnValue(new Promise(() => {}));
    render(<StudentExamsPage />);
    const apply = await screen.findByRole('button', { name: /^Apply for/ });
    await act(async () => { fireEvent.click(apply); fireEvent.click(apply); });
    expect(examsApi.apply).toHaveBeenCalledTimes(1);
    expect(examsApi.apply).toHaveBeenCalledWith('synthetic-token', { subject_id: 362, application_type: 'RE_EVALUATION', source_result_id: 'synthetic-result', source_session_id: 'synthetic-session' });
    expect(apply).toBeDisabled();
  });

  it('releases the pending control after an API failure so a deliberate retry is possible', async () => {
    examsApi.apply.mockRejectedValueOnce(new Error('Synthetic application failed')).mockReturnValueOnce(new Promise(() => {}));
    render(<StudentExamsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /^Apply for/ }));
    await screen.findByText('Synthetic application failed');
    const retry = screen.getByRole('button', { name: /^Apply for/ });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await waitFor(() => expect(examsApi.apply).toHaveBeenCalledTimes(2));
    expect(retry).toBeDisabled();
  });

  it('lets a student choose the exact published examination for a subject with multiple results', async () => {
    examsApi.reEvaluationSources.mockResolvedValue([
      { result_id: 'mid-result', session_id: 'mid-session', subject_id: 362, subject_name: 'Synthetic subject', subject_code: 'SYN-362', exam_type: 'MID_TERM', semester: 4, marks_obtained: 30, max_marks: 40 },
      { result_id: 'end-result', session_id: 'end-session', subject_id: 362, subject_name: 'Synthetic subject', subject_code: 'SYN-362', exam_type: 'END_TERM', semester: 4, marks_obtained: 42, max_marks: 50 },
    ]);
    examsApi.apply.mockReturnValue(new Promise(() => {}));
    render(<StudentExamsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply for SYN-362 END TERM semester 4' }));
    expect(examsApi.apply).toHaveBeenCalledWith('synthetic-token', { subject_id: 362, application_type: 'RE_EVALUATION', source_result_id: 'end-result', source_session_id: 'end-session' });
    expect(examsApi.apply).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Published marks: 30/40')).toBeTruthy();
  });

  it('shows source API errors and retries without presenting aggregated results as selectable exams', async () => {
    examsApi.reEvaluationSources.mockRejectedValueOnce(new Error('Synthetic published sources unavailable')).mockResolvedValueOnce([]);
    render(<StudentExamsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic published sources unavailable');
    expect(screen.queryByRole('button', { name: /^Apply for/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry examination choices' }));
    expect(await screen.findByText('No published examinations available for re-evaluation.')).toBeTruthy();
    expect(examsApi.apply).not.toHaveBeenCalled();
  });
});
