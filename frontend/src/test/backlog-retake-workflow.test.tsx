import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SelectHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentBacklogPage from '@/app/(portals)/student/backlog/page';
import { BacklogRetakeDesk } from '@/components/exam-cell/BacklogRetakeDesk';

const { api, toast, auth } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, toast: { error: vi.fn(), success: vi.fn() }, auth: { role: 'ExamCell' } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { roles: [auth.role], role: auth.role } }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));

const offering = { offering_id: 'offering', course_id: 'course', course_code: 'SYNTH', source_exam_type: 'END_TERM', semester: 4, fee_mode: 'REQUIRED', fee_amount: 123, selection_policy: 'BEST_ATTEMPT', attempt_limit: 2, opens_at: '2098-12-01T09:00:00Z', closes_at: '2099-01-01', exam_date: '2099-01-15', session_name: 'Synthetic January supplementary', status: 'DRAFT' };
const source = { source_report_id: 'report', course_id: 'course', course_code: 'SYNTH', course_name: 'Synthetic course', source_exam_type: 'END_TERM', semester: 4, marks_obtained: 10, max_marks: 50 };
const attempt = { attempt_id: 'attempt', student_name: 'Synthetic student', course_code: 'SYNTH', status: 'PAYMENT_PENDING', marks_status: 'DRAFT', fee_status: 'PENDING', demand_status: 'PENDING', finance_demand_id: 'demand', marks_obtained: null, max_marks: 50, result_status: null, grade: null, attempt_number: 1, review_reason: null };
function studentData() { return { offerings: [offering], failed_results: [source], applications: [] }; }
function staffData(path: string) {
  if (path.endsWith('/backlog/offerings')) return [offering];
  if (path.endsWith('/backlog/attempts')) return [attempt];
  if (path.endsWith('/courses')) return [{ course_id: 'course', course_code: 'SYNTH', course_name: 'Synthetic course' }];
  if (path.endsWith('/sessions')) return [{ session_id: 'session', session_name: 'Synthetic supplementary session', cycle_type: 'SUPPLEMENTARY' }];
  if (path.endsWith('/schedules')) return [{ exam_schedule_id: 'schedule', subject_name: 'Synthetic course', exam_date: '2099-01-01' }];
  if (path.endsWith('/faculty-roster')) return [{ user_id: 'faculty', name: 'Synthetic faculty' }];
  if (path.endsWith('/grading-policies')) return [{ policy_id: 1, policy_name: 'Explicit synthetic policy' }];
  return [];
}
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); toast.error.mockReset(); toast.success.mockReset(); auth.role = 'ExamCell'; });

describe('Student configured retake workflow', () => {
  it('distinguishes offerings by session, examination date and reference in the selector', async () => {
    api.get.mockResolvedValue({...studentData(),offerings:[{...offering,offering_id:'11111111-0000-4000-8000-000000000001'},{...offering,offering_id:'22222222-0000-4000-8000-000000000002',session_name:'Synthetic February supplementary',exam_date:'2099-02-15'}]});
    render(<StudentBacklogPage />);
    const select=await screen.findByLabelText('Available retake');
    expect(select).toHaveTextContent('Synthetic January supplementary');
    expect(select).toHaveTextContent(new Date('2099-01-15').toLocaleDateString('en-IN'));
    expect(select).toHaveTextContent('Ref 11111111');
    expect(select).toHaveTextContent('Synthetic February supplementary');
    expect(select).toHaveTextContent(new Date('2099-02-15').toLocaleDateString('en-IN'));
    expect(select).toHaveTextContent('Ref 22222222');
  });

  it('does not offer registration or assume a fee when no configured examination is open', async () => {
    api.get.mockResolvedValue({ offerings: [], failed_results: [source], applications: [] });
    render(<StudentBacklogPage />);
    expect(await screen.findByText(/No configured supplementary examination is open/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apply for this retake' })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });
  it('shows a retryable API error instead of claiming no configured examinations', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic retake API unavailable')).mockResolvedValue(studentData());
    render(<StudentBacklogPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic retake API unavailable');
    expect(screen.queryByText(/No configured supplementary examination is open/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText('Available retake')).toBeTruthy();
  });
  it('submits the explicitly selected offering and failed report only once', async () => {
    api.get.mockResolvedValue(studentData());
    let finish!: (value: object) => void;
    api.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<StudentBacklogPage />);
    fireEvent.change(await screen.findByLabelText('Available retake'), { target: { value: 'offering' } });
    fireEvent.change(screen.getByLabelText('Declared failed result'), { target: { value: 'report' } });
    const button = screen.getByRole('button', { name: 'Apply for this retake' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/api/academics/exams/backlog/applications', { offering_id: 'offering', source_report_id: 'report' });
    await act(async () => { finish({ attempt_id: 'attempt' }); });
    expect(toast.success).toHaveBeenCalledTimes(1);
  });
  it('clears the previous failed source when the selected offering changes', async () => {
    api.get.mockResolvedValue({ ...studentData(), offerings: [offering, { ...offering, offering_id: 'other', course_id: 'other', course_code: 'OTHER' }] });
    render(<StudentBacklogPage />);
    fireEvent.change(await screen.findByLabelText('Available retake'), { target: { value: 'offering' } });
    fireEvent.change(screen.getByLabelText('Declared failed result'), { target: { value: 'report' } });
    fireEvent.change(screen.getByLabelText('Available retake'), { target: { value: 'other' } });
    expect(screen.getByRole('button', { name: 'Apply for this retake' })).toBeDisabled();
    expect(screen.getByLabelText('Declared failed result')).toHaveValue('');
  });
  it('never claims payment success after an unsettled-payment API rejection', async () => {
    api.get.mockResolvedValue({ ...studentData(), applications: [attempt] });
    api.post.mockRejectedValue(new Error('Settled payment is required'));
    render(<StudentBacklogPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check settled payment' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Settled payment is required'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Open Finance/ })).toHaveAttribute('href', '/student/finance');
  });
  it('does not display draft marks even if an unexpected response contains them', async () => {
    api.get.mockResolvedValue({ ...studentData(), applications: [{ ...attempt, marks_obtained: 49, grade: 'A+', result_status: 'PASS' }] });
    render(<StudentBacklogPage />);
    expect(await screen.findByText('Not published')).toBeTruthy();
    expect(screen.queryByText(/49\/50/)).toBeNull();
  });
});

describe('Examination Cell retake rules and approval controls', () => {
  it('identifies identical course offerings with session/date, registration windows and references', async () => {
    api.get.mockImplementation((path:string)=>Promise.resolve(path.endsWith('/backlog/offerings')?[{...offering,offering_id:'11111111-0000-4000-8000-000000000001'},{...offering,offering_id:'22222222-0000-4000-8000-000000000002'}]:staffData(path)));
    render(<BacklogRetakeDesk />);
    const first=await screen.findByText(/Ref 11111111/);const second=screen.getByText(/Ref 22222222/);
    expect(first).toHaveTextContent('Synthetic January supplementary');
    expect(first).toHaveTextContent(new Date('2099-01-15').toLocaleDateString('en-IN'));
    expect(second).toHaveTextContent('Synthetic January supplementary');
    expect(first.closest('tr')).toHaveTextContent('Opens '+new Date(offering.opens_at).toLocaleString('en-IN'));
    expect(first.closest('tr')).toHaveTextContent('Closes '+new Date(offering.closes_at).toLocaleString('en-IN'));
    expect(second.closest('tr')).toHaveTextContent('Opens '+new Date(offering.opens_at).toLocaleString('en-IN'));
  });

  it('starts every academic and fee rule unselected and blocks incomplete setup', async () => {
    api.get.mockImplementation((path: string) => Promise.resolve(staffData(path)));
    render(<BacklogRetakeDesk />);
    expect(await screen.findByLabelText('Payment rule')).toHaveValue('');
    expect(screen.getByLabelText('Result selection rule')).toHaveValue('');
    expect(screen.getByLabelText('Fee amount (INR)')).toHaveValue(null);
    expect(screen.getByLabelText('Maximum published retakes')).toHaveValue(null);
    fireEvent.submit(screen.getByRole('button', { name: 'Save draft retake offering' }).closest('form')!);
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Every academic, payment and registration rule must be explicitly configured');
  });
  it('serializes repeated registration-opening clicks', async () => {
    api.get.mockImplementation((path: string) => Promise.resolve(staffData(path)));
    let finish!: (value: object) => void;
    api.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<BacklogRetakeDesk />);
    const button = await screen.findByRole('button', { name: 'Open registration' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/api/exam-cell/backlog/offerings/offering/status', { status: 'OPEN' });
    await act(async () => { finish({ status: 'OPEN' }); });
  });
  it('keeps the desk read-only for roles without management permission', async () => {
    auth.role = 'ExamOperator';
    api.get.mockImplementation((path: string) => Promise.resolve(staffData(path)));
    render(<BacklogRetakeDesk />);
    expect(await screen.findByText(/Synthetic student/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save draft retake offering' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve registration' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open registration' })).toBeNull();
  });
});
