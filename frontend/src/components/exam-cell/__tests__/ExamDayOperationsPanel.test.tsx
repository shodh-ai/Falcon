import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamDayOperationsPanel, type ScriptReconciliation } from '../ExamDayOperationsPanel';

const mocks = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, success: vi.fn(), error: vi.fn(), busy: vi.fn() }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/components/ui/select', () => ({ Select: ({ children, ...props }: ComponentProps<'select'>) => <select {...props}>{children}</select> }));
const base = '/api/exam-cell';
function fixture(): ScriptReconciliation {
  return {
    exam_schedule_id: 'schedule-a',
    summary: { roster: 2, expected_candidates: 1, received_candidates: 0, received_booklets: 0, registered_booklets: 0, outstanding_booklets: 0, absent: 1, attendance_pending: 0, pending_collection: 1, missing: 0, unlinked_booklets: 0, conflicts: 0 },
    candidates: [
      { student_user_id: 'student-a', student_name: 'Present Candidate', enrollment_number: 'TEST-1', attendance_status: 'PRESENT', expected: true, collection_status: 'PENDING_COLLECTION', sheets: [], discrepancy: null },
      { student_user_id: 'student-b', student_name: 'Absent Candidate', enrollment_number: 'TEST-2', attendance_status: 'ABSENT', expected: false, collection_status: 'NOT_EXPECTED', sheets: [], discrepancy: null },
    ],
  };
}
let data: ScriptReconciliation;
let incidents: Array<{ case_id: string; student_name: string; description: string; status: string; marks_locked: boolean; penalty_applied: string | null; exam_day_reference: string; review_reason: string | null }>;
beforeEach(() => {
  vi.resetAllMocks(); data = fixture(); incidents = [];
  mocks.api.get.mockImplementation(async (path: string) => path.includes('/exam-day/scripts?') ? data : incidents);
  mocks.api.post.mockResolvedValue({});
});
function show(role = 'ExamCell') { return render(<ExamDayOperationsPanel api={mocks.api as never} scheduleId="schedule-a" role={role} onBusyChange={mocks.busy} />); }
async function chooseCandidate(id = 'student-a') {
  fireEvent.change(await screen.findByLabelText('Script candidate'), { target: { value: id } });
}

describe('exam-day physical collection, missing scripts and incident actions', () => {
  it('records the actual candidate/booklet and reloads persisted reconciliation', async () => {
    mocks.api.post.mockImplementation(async () => {
      data = { ...data, summary: { ...data.summary, received_candidates: 1, received_booklets: 1, pending_collection: 0 }, candidates: [{ ...data.candidates[0], collection_status: 'COLLECTED', sheets: [{ sheet_id: 'receipt', sheet_number: 'REAL-BOOK-1', collected_at: '2026-10-23T09:00:00Z', status: 'COLLECTED' }] }, data.candidates[1]] };
      return { sheet_id: 'receipt' };
    });
    show(); await chooseCandidate();
    fireEvent.change(screen.getByLabelText('Actual booklet number'), { target: { value: 'REAL-BOOK-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record collected booklet' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith(`${base}/answer-sheets`, { exam_schedule_id: 'schedule-a', student_user_id: 'student-a', sheet_number: 'REAL-BOOK-1', collect: true }));
    expect(await screen.findByText('REAL-BOOK-1 (received)')).toBeVisible();
    expect(mocks.success).toHaveBeenCalledWith('Physical booklet receipt saved');
    expect(mocks.busy.mock.calls).toEqual([[true], [false]]);
  });

  it('disables collection and missing reports for absent candidates', async () => {
    show(); await chooseCandidate('student-b');
    fireEvent.change(screen.getByLabelText('Actual booklet number'), { target: { value: 'NO-SCRIPT' } });
    fireEvent.change(screen.getByLabelText('Missing / resolution reason'), { target: { value: 'Must not fabricate a missing script' } });
    expect(screen.getByRole('button', { name: 'Record collected booklet' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Report missing script' })).toBeDisabled();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('reports a missing script with the actual session candidate and explanation', async () => {
    show(); await chooseCandidate();
    fireEvent.change(screen.getByLabelText('Missing / resolution reason'), { target: { value: 'Missing after counting the scripts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Report missing script' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith(`${base}/exam-day/scripts/missing`, { exam_schedule_id: 'schedule-a', student_user_id: 'student-a', reason: 'Missing after counting the scripts' }));
  });

  it('still permits reporting a missing supplement when the main booklet has been received', async () => {
    data.candidates[0].sheets = [
      { sheet_id: 'main', sheet_number: 'MAIN', collected_at: '2026-10-23T09:00:00Z', status: 'COLLECTED' },
      { sheet_id: 'supplement', sheet_number: 'SUPPLEMENT', collected_at: null, status: 'ISSUED' },
    ];
    show(); await chooseCandidate();
    fireEvent.change(screen.getByLabelText('Missing / resolution reason'), { target: { value: 'Supplement has not been returned' } });
    expect(screen.getByRole('button', { name: 'Report missing script' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Report missing script' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith(`${base}/exam-day/scripts/missing`, expect.objectContaining({ reason: 'Supplement has not been returned' })));
  });

  it('requires a found-script explanation and sends it with the physical receipt', async () => {
    data.candidates[0].discrepancy = { discrepancy_id: 'missing-a', status: 'MISSING', reason: 'Not received', resolution: null };
    data.candidates[0].collection_status = 'MISSING';
    show(); await chooseCandidate();
    fireEvent.change(screen.getByLabelText('Actual booklet number'), { target: { value: 'FOUND-BOOK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record collected booklet' }));
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('how the missing script was found'));
    fireEvent.change(screen.getByLabelText('Missing / resolution reason'), { target: { value: 'Found in the correct sealed tray' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record collected booklet' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith(`${base}/answer-sheets`, expect.objectContaining({ resolution_reason: 'Found in the correct sealed tray' })));
  });

  it('corrects a mistaken missing report without creating a receipt', async () => {
    data.candidates[0].discrepancy = { discrepancy_id: 'missing-a', status: 'MISSING', reason: 'Not received', resolution: null };
    show(); await chooseCandidate();
    fireEvent.change(screen.getByLabelText('Missing / resolution reason'), { target: { value: 'Incorrect candidate was selected' } });
    fireEvent.click(screen.getByRole('button', { name: 'Correct mistaken missing report' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith(`${base}/exam-day/scripts/missing-a/resolve`, { resolution: 'REPORTED_IN_ERROR', reason: 'Incorrect candidate was selected' }));
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
  });

  it('keeps ExamOperator read only and does not grant ExamAdmin incident authority', async () => {
    const view = show('ExamOperator');
    await screen.findByText('Candidates who sat');
    expect(screen.queryByRole('button', { name: 'Record collected booklet' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record UFM incident' })).not.toBeInTheDocument();
    view.rerender(<ExamDayOperationsPanel api={mocks.api as never} scheduleId="schedule-a" role="ExamAdmin" onBusyChange={mocks.busy} />);
    expect(screen.getByRole('button', { name: 'Record collected booklet' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Record UFM incident' })).not.toBeInTheDocument();
  });

  it('corrects a mistaken receipt with a reason without deleting the booklet record', async () => {
    data.candidates[0].sheets = [{ sheet_id: 'receipt-a', sheet_number: 'WRONG-RECEIPT', collected_at: '2026-10-23T09:00:00Z', status: 'COLLECTED' }];
    show(); await chooseCandidate();
    expect(screen.getByRole('button', { name: 'Correct receipt WRONG-RECEIPT' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Missing / resolution reason'), { target: { value: 'Wrong candidate selected at collection' } });
    fireEvent.click(screen.getByRole('button', { name: 'Correct receipt WRONG-RECEIPT' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith(`${base}/answer-sheets/receipt-a/correct-receipt`, { reason: 'Wrong candidate selected at collection' }));
  });

  it('does not show empty counts or permit writes when the backend read fails; retry restores the real data', async () => {
    mocks.api.get.mockRejectedValueOnce(new Error('Reconciliation unavailable'));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Reconciliation unavailable');
    expect(screen.queryByText('Candidates with receipts')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record collected booklet' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh operations' }));
    expect(await screen.findByText('Candidates with receipts')).toBeVisible();
  });

  it('reports write failure without a success message or forged collected state', async () => {
    mocks.api.post.mockRejectedValue(new Error('Receipt audit failed'));
    show(); await chooseCandidate();
    fireEvent.change(screen.getByLabelText('Actual booklet number'), { target: { value: 'FAILED-BOOK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record collected booklet' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Receipt audit failed'));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByText('PENDING COLLECTION')).toBeVisible();
  });

  it('prevents duplicate collection requests while the first operation is pending', async () => {
    let finish!: (value: object) => void;
    mocks.api.post.mockReturnValue(new Promise(done => { finish = done; }));
    show(); await chooseCandidate();
    fireEvent.change(screen.getByLabelText('Actual booklet number'), { target: { value: 'ONE-BOOK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record collected booklet' }));
    expect(screen.getByRole('button', { name: 'Record collected booklet' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Record collected booklet' }));
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    await act(async () => { finish({}); });
  });

  it('records an incident without a penalty and follows review then closure with reasons', async () => {
    mocks.api.post.mockImplementation(async (path: string, body: { status?: string }) => {
      if (path === `${base}/exam-day/ufm`) incidents = [{ case_id: 'case-a', student_name: 'Present Candidate', description: 'Unauthorized material', status: 'OPEN', marks_locked: false, penalty_applied: null, exam_day_reference: 'retry', review_reason: null }];
      else incidents = [{ ...incidents[0], status: body.status! }];
      return {};
    });
    show();
    fireEvent.change(await screen.findByLabelText('Incident candidate'), { target: { value: 'student-a' } });
    fireEvent.change(screen.getByLabelText('Incident details'), { target: { value: 'Unauthorized material' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record UFM incident' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith(`${base}/exam-day/ufm`, { exam_schedule_id: 'schedule-a', student_user_id: 'student-a', description: 'Unauthorized material', request_id: expect.any(String) }));
    fireEvent.change(await screen.findByLabelText('Review / closure reason'), { target: { value: 'Evidence reviewed by authorized officer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start incident review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close reviewed incident' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith(`${base}/exam-day/ufm/case-a/status`, { status: 'CLOSED', reason: 'Evidence reviewed by authorized officer' }));
  });

  it('ignores stale responses from a previously selected examination', async () => {
    let finishOld!: (value: ScriptReconciliation) => void;
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path.includes('scripts?exam_schedule_id=schedule-a')) return new Promise<ScriptReconciliation>(done => { finishOld = done; });
      if (path.includes('/scripts?')) return { ...fixture(), exam_schedule_id: 'schedule-b', candidates: [] };
      return [];
    });
    const view = show();
    view.rerender(<ExamDayOperationsPanel api={mocks.api as never} scheduleId="schedule-b" role="ExamCell" onBusyChange={mocks.busy} />);
    await screen.findByText('Candidates who sat');
    await act(async () => { finishOld(fixture()); });
    expect(screen.queryByText('Present Candidate')).not.toBeInTheDocument();
  });
});
