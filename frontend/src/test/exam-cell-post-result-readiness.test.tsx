import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps, ReactNode } from 'react';
import ReEvaluationsPage from '@/app/(portals)/exam-cell/re-evaluations/page';
import BacklogPage from '@/app/(portals)/exam-cell/backlog-exams/page';
import FacultyReEvaluationsPage from '@/app/(portals)/faculty/re-evaluations/page';

const { api, toast } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: ComponentProps<'select'>) => <select {...props} /> }));
vi.mock('@/components/faculty', () => ({ FacultyPageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>, FacultyPageHeader: () => <h1>Re-evaluation</h1> }));
vi.mock('@/lib/faculty-demo-mode', () => ({ isEmptyArray: (rows: unknown[]) => !rows.length, withFacultyDemoFallback: (rows: unknown[]) => rows, isFacultyDemoSmokeId: () => false }));

const application = (name: string, status = 'UNDER_REVIEW') => ({
  exam_application_id: name, student_name: name, subject_name: 'Synthetic subject', subject_code: 'SYN',
  fee_status: 'PAID', status, created_at: '2026-10-19T00:00:00Z', enrollment_number: 'SYNTHETIC',
});

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); toast.error.mockReset(); toast.success.mockReset(); });

describe('Post-result workflow readiness', () => {
  it('distinguishes a failed revaluation queue from a genuine empty queue and retries', async () => {
    let failed = true;
    api.get.mockImplementation((path: string) => path.includes('faculty-roster') ? Promise.resolve([]) : failed ? Promise.reject(new Error('Synthetic queue unavailable')) : Promise.resolve([]));
    render(<ReEvaluationsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic queue unavailable');
    expect(screen.queryByText('No re-evaluation requests in this filter.')).toBeNull();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No re-evaluation requests in this filter.')).toBeTruthy();
  });

  it('keeps an older backlog response from replacing a newer status filter', async () => {
    let resolveOld!: (rows: object[]) => void;
    api.get.mockImplementation((path: string) => path.includes('status=PENDING') ? Promise.resolve([application('Current pending', 'PENDING')]) : new Promise((resolve) => { resolveOld = resolve; }));
    render(<BacklogPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'PENDING' } });
    expect(await screen.findByText('Current pending')).toBeTruthy();
    await act(async () => { resolveOld([application('Stale backlog', 'COMPLETED')]); });
    expect(screen.queryByText('Stale backlog')).toBeNull();
    expect(screen.getByText('Current pending')).toBeTruthy();
  });

  it('does not show old backlog rows as the result of a failed filter request', async () => {
    api.get.mockResolvedValueOnce([application('Old backlog')]).mockRejectedValueOnce(new Error('Synthetic backlog unavailable'));
    render(<BacklogPage />);
    await screen.findByText('Old backlog');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'PENDING' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic backlog unavailable');
    expect(screen.queryByText('Old backlog')).toBeNull();
    expect(screen.queryByText('No backlog or supplementary applications.')).toBeNull();
  });

  it('sends one publication request for repeated clicks while the operation is pending', async () => {
    api.get.mockImplementation((path: string) => Promise.resolve(path.includes('faculty-roster') ? [] : [application('Synthetic reassessment')]));
    api.post.mockReturnValue(new Promise(() => {}));
    render(<ReEvaluationsPage />);
    const publish = await screen.findByRole('button', { name: 'Publish report to student & parent' });
    await act(async () => { fireEvent.click(publish); fireEvent.click(publish); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(publish).toBeDisabled();
  });

  it('shows and retries a failed faculty roster without hiding the revaluation queue', async () => {
    let rosterFailed = true;
    api.get.mockImplementation((path: string) => path.includes('faculty-roster')
      ? rosterFailed ? Promise.reject(new Error('Synthetic faculty roster unavailable')) : Promise.resolve([{ user_id: 'faculty-one', name: 'Synthetic faculty' }])
      : Promise.resolve([application('Synthetic pending assignment', 'PENDING')]));
    render(<ReEvaluationsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic faculty roster unavailable');
    expect(screen.getByRole('button', { name: /Synthetic pending assignment/ })).toBeTruthy();
    expect(screen.getByLabelText('Faculty member')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Assign for reassessment' })).toBeDisabled();
    rosterFailed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry faculty list' }));
    await screen.findByRole('option', { name: 'Synthetic faculty' });
    fireEvent.change(screen.getByLabelText('Faculty member'), { target: { value: 'faculty-one' } });
    expect(screen.getByRole('button', { name: 'Assign for reassessment' })).toBeEnabled();
  });

  it('requires faculty to enter revised marks explicitly instead of turning blank input into zero', async () => {
    api.get.mockResolvedValue([application('Synthetic faculty case', 'ASSIGNED')]);
    render(<FacultyReEvaluationsPage />);
    fireEvent.change(await screen.findByPlaceholderText('Reassessment notes, observations, and justification'), { target: { value: 'Synthetic reassessment notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report to Exam Cell' }));
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Enter valid revised marks');
  });

  it('shows faculty an API failure instead of synthetic cases or a genuine empty-state message', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic faculty queue unavailable')).mockResolvedValueOnce([]);
    render(<FacultyReEvaluationsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic faculty queue unavailable');
    expect(screen.queryByText('No re-evaluation assignments yet.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No re-evaluation assignments yet.')).toBeTruthy();
  });

  it('allows an explicitly entered zero and guards repeated faculty report submissions', async () => {
    api.get.mockResolvedValue([application('Synthetic zero grade case', 'ASSIGNED')]);
    api.post.mockReturnValue(new Promise(() => {}));
    render(<FacultyReEvaluationsPage />);
    fireEvent.change(await screen.findByLabelText('Revised marks'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Reassessment report notes'), { target: { value: 'Synthetic zero mark justification' } });
    const submit = screen.getByRole('button', { name: 'Submit report to Exam Cell' });
    await act(async () => { fireEvent.click(submit); fireEvent.click(submit); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(expect.stringContaining('/report'), { revised_marks: 0, report_notes: 'Synthetic zero mark justification' });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
