import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import AdmitCardsPage from '@/app/(portals)/exam-cell/admit-cards/page';
import HallTicketApprovalsPage from '@/app/(portals)/exam-cell/hall-ticket-approvals/page';

const { api, auth, toast } = vi.hoisted(() => {
  const api = { get: vi.fn(), post: vi.fn() };
  return { api, auth: { api, user: { role: 'ExamCell', roles: ['ExamCell'], primaryRole: 'ExamCell' } }, toast: { error: vi.fn(), success: vi.fn() } };
});
vi.mock('@/lib/api', () => ({ useAuthedApi: () => auth.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: ComponentProps<'select'>) => <select {...props} /> }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const audit = (name = 'Synthetic eligible student', semester = 4) => ({
  batch_label: `B.Tech Sem ${semester} END TERM`, semester, eligible_count: name ? 1 : 0, blocked_count: 0,
  items: name ? [{ student_user_id: name, student_id: 'SYNTHETIC-01', name, semester, fee_status: 'Clear', attendance_percent: 90, has_exemption: false, eligible: true, block_reasons: [] }] : [],
});
const approval = (name = 'Synthetic approval student') => ({ approval_id: name, student_name: name, enrollment_number: 'SYNTHETIC-01', stage: 'REGISTRATION', eligibility_status: 'ELIGIBLE', finance_status: 'CLEAR', exam_office_status: 'PENDING', coe_status: 'PENDING', block_reasons: [] });

beforeEach(() => {
  auth.api = api;
  auth.user = { role: 'ExamCell', roles: ['ExamCell'], primaryRole: 'ExamCell' };
  api.get.mockReset(); api.post.mockReset(); toast.error.mockReset(); toast.success.mockReset();
});

describe('Admit-card audit and generation controls', () => {
  it('shows a retryable audit failure separately from an empty semester', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic audit unavailable')).mockResolvedValueOnce(audit(''));
    render(<AdmitCardsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic audit unavailable');
    expect(screen.queryByText('No enrolled students for this semester.')).toBeNull();
    expect(screen.getByRole('button', { name: /Generate Admit Cards/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry audit' }));
    expect((await screen.findAllByText('No enrolled students for this semester.')).length).toBeGreaterThan(0);
  });

  it('does not generate or export using the previous semester audit while the new request is pending', async () => {
    const next = deferred<ReturnType<typeof audit>>();
    api.get.mockResolvedValueOnce(audit()).mockReturnValueOnce(next.promise);
    render(<AdmitCardsPage />);
    await screen.findAllByText('Synthetic eligible student');
    fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '5' } });
    expect(screen.queryByText('Synthetic eligible student')).toBeNull();
    expect(screen.getByRole('button', { name: /Generate Admit Cards/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export Defaulter List' })).toBeDisabled();
    await act(async () => next.resolve(audit('Current semester student', 5)));
    expect(screen.getByRole('button', { name: /Generate Admit Cards/ })).toBeEnabled();
  });

  it('ignores an older exam-type audit response', async () => {
    const old = deferred<ReturnType<typeof audit>>();
    api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(audit('Current mid-term student'));
    render(<AdmitCardsPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Exam type'), { target: { value: 'MID_TERM' } });
    await screen.findAllByText('Current mid-term student');
    await act(async () => old.resolve(audit('Stale end-term student')));
    expect(screen.queryByText('Stale end-term student')).toBeNull();
    expect(screen.getAllByText('Current mid-term student').length).toBeGreaterThan(0);
  });

  it('generates once while pending, freezes the batch and allows retry after failure', async () => {
    const pending = deferred<object>();
    api.get.mockResolvedValue(audit());
    api.post.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ generated: 1, blocked: 0 });
    render(<AdmitCardsPage />);
    await screen.findAllByText('Synthetic eligible student');
    const generate = screen.getByRole('button', { name: /Generate Admit Cards/ });
    await act(async () => { fireEvent.click(generate); fireEvent.click(generate); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/api/exam-cell/admit-cards/generate', { semester: 4, batch_label: 'B.Tech Sem 4 END TERM' });
    expect(screen.getByLabelText('Semester')).toBeDisabled();
    expect(screen.getByLabelText('Exam type')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => pending.reject(new Error('Synthetic generation failure')));
    fireEvent.click(screen.getByRole('button', { name: /Generate Admit Cards/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  });

  it('mirrors backend fallback roles while hiding generation from read-only roles', async () => {
    api.get.mockResolvedValue(audit());
    auth.user = { role: 'Faculty', roles: ['Faculty'], primaryRole: 'ExamCell' };
    const { rerender } = render(<AdmitCardsPage />);
    await screen.findAllByText('Synthetic eligible student');
    expect(screen.getByRole('button', { name: /Generate Admit Cards/ })).toBeEnabled();
    auth.user = { role: 'Faculty', roles: ['Faculty'], primaryRole: 'Faculty' };
    rerender(<AdmitCardsPage />);
    expect(screen.queryByRole('button', { name: /Generate Admit Cards/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Hall Ticket Approval Workflow →' })).toBeTruthy();
  });
});

describe('Hall-ticket approval queue controls', () => {
  it('shows a retryable queue failure separately from a genuine empty queue', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic approval queue unavailable')).mockResolvedValueOnce([]);
    render(<HallTicketApprovalsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic approval queue unavailable');
    expect(screen.queryByText('No approval records yet. Use Sync from eligibility to build the queue.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry approvals' }));
    expect(await screen.findByText('No approval records yet. Use Sync from eligibility to build the queue.')).toBeTruthy();
  });

  it.each([['Semester', '5'], ['Exam type', 'MID_TERM'], ['Stage', 'COE']])('ignores an obsolete response after changing %s', async (label, value) => {
    const old = deferred<object[]>();
    api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce([approval('Current filtered student')]);
    render(<HallTicketApprovalsPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    await screen.findByText('Current filtered student');
    await act(async () => old.resolve([approval('Stale approval student')]));
    expect(screen.queryByText('Stale approval student')).toBeNull();
    expect(screen.getByText('Current filtered student')).toBeTruthy();
  });

  it('sends only one pending decision and freezes scope filters', async () => {
    api.get.mockResolvedValue([approval()]);
    api.post.mockReturnValue(new Promise(() => {}));
    render(<HallTicketApprovalsPage />);
    const advance = await screen.findByRole('button', { name: 'Advance' });
    const reject = screen.getByRole('button', { name: 'Reject' });
    await act(async () => { fireEvent.click(advance); fireEvent.click(reject); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/api/exam-cell/hall-ticket-approvals/Synthetic approval student/advance', { action: 'APPROVE' });
    expect(screen.getByLabelText('Semester')).toBeDisabled();
    expect(screen.getByLabelText('Exam type')).toBeDisabled();
    expect(screen.getByLabelText('Stage')).toBeDisabled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('sends only one queue mutation for same-tick sync and bulk clicks', async () => {
    api.get.mockResolvedValue([approval()]);
    api.post.mockReturnValue(new Promise(() => {}));
    render(<HallTicketApprovalsPage />);
    await screen.findByText('Synthetic approval student');
    const sync = screen.getByRole('button', { name: 'Sync from eligibility' });
    const bulk = screen.getByRole('button', { name: 'Bulk advance to COE' });
    await act(async () => { fireEvent.click(sync); fireEvent.click(bulk); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/api/exam-cell/hall-ticket-approvals/sync', { semester: 4, batch_label: 'B.Tech Sem 4 END TERM' });
  });

  it('uses existing backend role collection for actions and preserves read-only navigation', async () => {
    api.get.mockResolvedValue([approval()]);
    auth.user = { role: 'Faculty', roles: [], primaryRole: 'ExamCell' };
    const { rerender } = render(<HallTicketApprovalsPage />);
    expect(await screen.findByRole('button', { name: 'Advance' })).toBeTruthy();
    auth.user = { role: 'Faculty', roles: ['Faculty'], primaryRole: 'Faculty' };
    rerender(<HallTicketApprovalsPage />);
    expect(screen.queryByRole('button', { name: 'Advance' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sync from eligibility' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bulk advance to COE' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Generate hall tickets' })).toHaveAttribute('href', '/exam-cell/admit-cards');
  });
});
