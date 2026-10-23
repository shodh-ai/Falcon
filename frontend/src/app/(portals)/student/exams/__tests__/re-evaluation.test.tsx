import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentExamsPage from '../page';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn() },
  exams: { schedule: vi.fn(), eligibility: vi.fn(), myApplications: vi.fn(), reEvaluationResults: vi.fn(), apply: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));
const params = new URLSearchParams('intent=revaluation');
const first = { result_id: '10000000-0000-4000-8000-000000000001', subject_id: 1, subject_name: 'Algorithms', subject_code: 'CS101', exam_session: 'Spring 2026', exam_type: 'END_TERM', marks_obtained: 35, max_marks: 100, is_valid: true, can_apply_for_re_evaluation: true };
const second = { ...first, result_id: '10000000-0000-4000-8000-000000000002', exam_session: 'Autumn 2026', exam_type: 'MID_TERM', marks_obtained: 20, max_marks: 40 };
const application = { exam_application_id: 'app-1', subject_id: 1, exam_result_id: second.result_id, application_type: 'RE_EVALUATION', status: 'DRAFT', fee_status: 'PENDING', created_at: '2026-10-19' };

vi.mock('next/navigation', () => ({ useSearchParams: () => params }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'test-token', user: { user_id: 'student-1' } }) }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/lib/api/api.exams', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/api/api.exams')>(), examsApi: fixtures.exams }));
vi.mock('@/lib/student-demo-mode', () => ({ isStudentDemoModeEnabled: () => false }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/components/attendance/StudentExemptionPanel', () => ({ StudentExemptionPanel: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  params.set('intent', 'revaluation');
  fixtures.api.get.mockResolvedValue({ seating: [] });
  fixtures.exams.schedule.mockResolvedValue([]);
  fixtures.exams.eligibility.mockResolvedValue({ eligible: true, attendance_percent: 90, reasons: [] });
  fixtures.exams.myApplications.mockReset().mockResolvedValue([]);
  fixtures.exams.reEvaluationResults.mockResolvedValue([first, second]);
  fixtures.exams.apply.mockReset().mockResolvedValue(application);
});
afterEach(cleanup);

function row(session: string) {
  return screen.getByText(session).parentElement!.parentElement!;
}

describe('student exact exam re-evaluation applications', () => {
  it('opens a newly supplied revaluation deep-link while allowing manual tab changes', async () => {
    params.delete('intent');
    const view = render(<StudentExamsPage />);
    await screen.findByText('Upcoming Exams');
    params.set('intent', 'revaluation');
    view.rerender(<StudentExamsPage />);
    expect(screen.getByText('Choose the exam result to re-evaluate')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Exam Schedule & Seating/ }));
    expect(screen.getByText('Upcoming Exams')).toBeInTheDocument();
  });

  it('shows verified fee details and ignores malformed fee detail rows', async () => {
    fixtures.exams.eligibility.mockResolvedValue({ eligible: false, attendance_percent: 90, reasons: [
      { code: 'PENDING_FEE_DUES', details: [null, {}, { fee_head: 'Tuition', outstanding: '1200' }, { fee_head: 'Invalid fee', outstanding: 'unavailable' }] },
    ] });
    render(<StudentExamsPage />);
    await screen.findByText('Choose the exam result to re-evaluate');
    fireEvent.click(screen.getByRole('button', { name: /Admit Card/ }));
    expect(screen.getByText('Please clear your Tuition of ₹1200 to unlock.')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('keeps fee clearance guidance when the server provides no usable fee detail rows', async () => {
    fixtures.exams.eligibility.mockResolvedValue({ eligible: false, attendance_percent: 90, reasons: [
      { code: 'PENDING_FEE_DUES', details: [null, { fee_head: 'Invalid fee', outstanding: {} }] },
    ] });
    render(<StudentExamsPage />);
    await screen.findByText('Choose the exam result to re-evaluate');
    fireEvent.click(screen.getByRole('button', { name: /Admit Card/ }));
    expect(screen.getByText('Please clear pending fee dues to unlock.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Admit Card (PDF)' })).toBeDisabled();
  });

  it('distinguishes exams for the same subject and submits only the explicitly selected result', async () => {
    fixtures.exams.myApplications.mockResolvedValueOnce([]).mockResolvedValue([application]);
    render(<StudentExamsPage />);
    await screen.findByText('Autumn 2026 · MID TERM');
    expect(within(row('Spring 2026 · END TERM')).getByText('Marks: 35 / 100')).toBeInTheDocument();
    expect(within(row('Autumn 2026 · MID TERM')).getByText('Marks: 20 / 40')).toBeInTheDocument();
    fireEvent.click(within(row('Autumn 2026 · MID TERM')).getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(fixtures.exams.apply).toHaveBeenCalledExactlyOnceWith('test-token', {
      subject_id: 1, exam_result_id: second.result_id, application_type: 'RE_EVALUATION',
    }));
    expect(fixtures.exams.reEvaluationResults).toHaveBeenCalledWith('test-token');
  });

  it('does not allow an unpublished or invalid result to be selected', async () => {
    fixtures.exams.reEvaluationResults.mockResolvedValue([{ ...first, is_valid: false, validation_message: 'This result has not been published.' }]);
    render(<StudentExamsPage />);
    await screen.findByText('This result has not been published.');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(fixtures.exams.apply).not.toHaveBeenCalled();
  });

  it('keeps legacy marks visible but blocks a paid application until the official source is verified', async () => {
    fixtures.exams.reEvaluationResults.mockResolvedValue([{ ...first, can_apply_for_re_evaluation:false,
      re_evaluation_eligibility_message:'Exam Cell must verify this result’s official declaration source before a paid re-evaluation can be requested.' }]);
    render(<StudentExamsPage />);
    await screen.findByText(/official declaration source/);
    expect(screen.getByText('Marks: 35 / 100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name:'Apply' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name:'Apply' }));
    expect(fixtures.exams.apply).not.toHaveBeenCalled();
  });

  it('prevents duplicate same-tick applications and locks other results while applying', async () => {
    let resolveApply!: (value: object) => void;
    fixtures.exams.apply.mockReturnValue(new Promise<object>((resolve) => { resolveApply = resolve; }));
    fixtures.exams.myApplications.mockResolvedValueOnce([]).mockResolvedValue([application]);
    render(<StudentExamsPage />);
    await screen.findByText('Autumn 2026 · MID TERM');
    const apply = within(row('Autumn 2026 · MID TERM')).getByRole('button', { name: 'Apply' });
    act(() => { fireEvent.click(apply); fireEvent.click(apply); });

    expect(fixtures.exams.apply).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Applying…' })).toBeDisabled();
    expect(within(row('Spring 2026 · END TERM')).getByRole('button', { name: 'Apply' })).toBeDisabled();
    await act(async () => { resolveApply(application); });
  });

  it('retains a successful application if refreshing requests fails so it cannot be submitted again', async () => {
    fixtures.exams.myApplications.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Requests unavailable'));
    render(<StudentExamsPage />);
    await screen.findByText('Autumn 2026 · MID TERM');
    fireEvent.click(within(row('Autumn 2026 · MID TERM')).getByRole('button', { name: 'Apply' }));

    await screen.findByText(/Application submitted, but requests could not be refreshed/);
    expect(within(row('Autumn 2026 · MID TERM')).getByRole('button', { name: 'Applied' })).toBeDisabled();
    expect(fixtures.toast.success).toHaveBeenCalledExactlyOnceWith('Re-evaluation application submitted');
    expect(fixtures.exams.apply).toHaveBeenCalledTimes(1);
  });
});
