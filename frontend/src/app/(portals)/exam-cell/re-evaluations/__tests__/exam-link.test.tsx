import type { SelectHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExamCellReEvaluationsPage from '../page';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
  queue: [] as unknown[],
}));
const application = { exam_application_id: 'app-1', student_name: 'First Student', subject_name: 'Algorithms', subject_code: 'CS101', fee_status: 'PAID', status: 'UNDER_REVIEW', original_marks: 20, revised_marks: 30, report_notes: 'Rechecked', exam_link_status: 'ambiguous', exam_max_marks: null, exam_link_message: 'Select the specific exam result.', created_at: '2026-10-19' };
const result = { result_id: '10000000-0000-4000-8000-000000000001', subject_id: 1, exam_session: 'Spring 2026', exam_type: 'MID_TERM', marks_obtained: 20, max_marks: 40, is_valid: true, link_verified: true, link_validation_message: null as string | null };
const lowerResult = { ...result, result_id: '10000000-0000-4000-8000-000000000002', exam_session: 'Autumn 2026', max_marks: 20 };

vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/components/exam-cell/ReEvaluationQaPanel', () => ({ ReEvaluationQaPanel: () => <div>Local QA workflow</div> }));

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.queue = [application];
  fixtures.api.get.mockReset().mockImplementation(async (path: string) => path.endsWith('/faculty-roster') ? [] : path.endsWith('/exam-results') ? [result, lowerResult] : fixtures.queue);
  fixtures.api.post.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

function publishButton() { return screen.getByRole('button', { name: 'Publish report to student & parent' }); }
function resultSelect() { return screen.getByRole('combobox', { name: 'Exam result' }); }
function linkButton() { return screen.getByRole('button', { name: 'Link selected exam result' }); }

describe('Exam Cell explicit result linkage', () => {
  it.each([
    ['a1000002-0000-4000-8000-000000000002', 'ASSIGNED', null],
    ['a1000003-0000-4000-8000-000000000003', 'UNDER_REVIEW', '46.00'],
  ])('keeps seeded demo request %s read only with every saved value unchanged', async (id, status, revised_marks) => {
    const demo = { ...application, exam_application_id: id, student_name: 'Student Four', subject_code: 'SMOKE101', status, original_marks: '42.00', revised_marks, report_notes: 'Existing demo note', exam_link_status: 'missing' };
    fixtures.queue = [demo];
    render(<ExamCellReEvaluationsPage />);

    expect(await screen.findByRole('note', { name: 'Read-only demo request' })).toHaveTextContent('separate local QA workflow');
    expect(screen.getByText('Original marks:').parentElement).toHaveTextContent('42.00');
    if (revised_marks !== null) expect(screen.getByText('Revised marks:').parentElement).toHaveTextContent('46.00');
    expect(screen.getByText('Existing demo note')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link selected exam result' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish report to student & parent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fixtures.api.get.mock.calls.some(([path]) => path.endsWith('/exam-results'))).toBe(false);
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(fixtures.queue).toEqual([demo]);
  });

  it('restores the normal verified-link controls when switching from a seeded demo to another SMOKE101 request', async () => {
    fixtures.queue = [
      { ...application, exam_application_id: 'a1000002-0000-4000-8000-000000000002', subject_code: 'SMOKE101', student_name: 'Student Four', status: 'ASSIGNED' },
      { ...application, student_name: 'Other SMOKE101 case', subject_code: 'SMOKE101' },
    ];
    render(<ExamCellReEvaluationsPage />);
    await screen.findByRole('note', { name: 'Read-only demo request' });
    fireEvent.click(screen.getByRole('button', { name: /Other SMOKE101 case/ }));

    await screen.findByRole('option', { name: /Spring 2026/ });
    expect(screen.queryByRole('note', { name: 'Read-only demo request' })).not.toBeInTheDocument();
    expect(linkButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    fireEvent.change(resultSelect(), { target: { value: result.result_id } });
    expect(linkButton()).toBeEnabled();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('requires an explicit result choice and excludes a maximum below the submitted marks', async () => {
    render(<ExamCellReEvaluationsPage />);
    await screen.findByRole('option', { name: /Spring 2026/ });
    expect(resultSelect()).toHaveValue('');
    expect(linkButton()).toBeDisabled();
    expect(publishButton()).toBeDisabled();
    expect(screen.getByRole('option', { name: /Autumn 2026/ })).toBeDisabled();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('links only the selected exact result and then exposes its marking scale', async () => {
    fixtures.api.post.mockImplementation(async (path: string, body: { exam_result_id?: string }) => {
      expect(path).toBe('/api/exam-cell/re-evaluations/app-1/exam-result');
      expect(body).toEqual({ exam_result_id: result.result_id });
      const linked = { ...application, exam_result_id: result.result_id, exam_link_status: 'linked', exam_max_marks: 40, exam_session: result.exam_session, exam_type: result.exam_type, exam_link_message: null };
      fixtures.queue = [linked];
      return linked;
    });
    render(<ExamCellReEvaluationsPage />);
    await screen.findByRole('option', { name: /Spring 2026/ });
    fireEvent.change(resultSelect(), { target: { value: result.result_id } });
    fireEvent.click(linkButton());

    await waitFor(() => expect(fixtures.toast.success).toHaveBeenCalledWith('Specific exam result linked'));
    await waitFor(() => expect(publishButton()).toBeEnabled());
    expect(screen.getByText('Maximum marks:').parentElement).toHaveTextContent('40');
    expect(screen.getByText('Exam:').parentElement).toHaveTextContent('Spring 2026 · MID TERM');
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
  });

  it.each(['PENDING', 'ASSIGNED'])(
    'blocks a result that would replace the original marks of a %s request',
    async (status) => {
      fixtures.queue = [{ ...application, status, original_marks: 42, revised_marks: null }];
      fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('/faculty-roster') ? [] : path.endsWith('/exam-results') ? [{ ...result, marks_obtained: 48, max_marks: 100 }] : fixtures.queue);
      render(<ExamCellReEvaluationsPage />);
      const option = await screen.findByRole('option', { name: /Spring 2026/ });
      expect(option).toBeDisabled();
      expect(option).toHaveTextContent('Original marks do not match');
      expect(screen.getByText('Original marks:').parentElement).toHaveTextContent('42');
      expect(linkButton()).toBeDisabled();
      expect(fixtures.api.post).not.toHaveBeenCalled();
    },
  );

  it.each([null, ''])(
    'does not populate missing original marks by linking (%s)',
    async (original_marks) => {
      fixtures.queue = [{ ...application, status: 'ASSIGNED', original_marks, revised_marks: null }];
      render(<ExamCellReEvaluationsPage />);
      const option = await screen.findByRole('option', { name: /Spring 2026/ });
      expect(option).toBeDisabled();
      expect(option).toHaveTextContent('Original marks are unavailable');
      expect(linkButton()).toBeDisabled();
      expect(fixtures.api.post).not.toHaveBeenCalled();
    },
  );

  it.each([false, undefined])('requires explicit official-source verification before linking (%s)', async (link_verified) => {
    fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('/faculty-roster') ? [] : path.endsWith('/exam-results') ? [{ ...result, link_verified }] : fixtures.queue);
    render(<ExamCellReEvaluationsPage />);
    const option = await screen.findByRole('option', { name: /Spring 2026/ });
    expect(option).toBeDisabled();
    expect(option).toHaveTextContent('official result source has not been verified');
    expect(linkButton()).toBeDisabled();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('shows a QA-source refusal even when marks and maximum are otherwise valid', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('/faculty-roster') ? [] : path.endsWith('/exam-results') ? [{ ...result, link_verified: false, link_validation_message: 'QA walkthrough data cannot be linked to official requests' }] : fixtures.queue);
    render(<ExamCellReEvaluationsPage />);
    const option = await screen.findByRole('option', { name: /Spring 2026/ });
    expect(option).toBeDisabled();
    expect(option).toHaveTextContent('QA walkthrough data cannot be linked');
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('preserves the assigned request draft and sends only the verified result reference', async () => {
    const assigned = { ...application, status: 'ASSIGNED', revised_marks: null, report_notes: 'Retained note' };
    fixtures.queue = [assigned];
    fixtures.api.post.mockImplementation(async () => {
      const linked = { ...assigned, exam_result_id: result.result_id, exam_link_status: 'linked', exam_max_marks: 40 };
      fixtures.queue = [linked];
      return linked;
    });
    render(<ExamCellReEvaluationsPage />);
    await screen.findByRole('option', { name: /Spring 2026/ });
    fireEvent.change(resultSelect(), { target: { value: result.result_id } });
    fireEvent.click(linkButton());
    await waitFor(() => expect(fixtures.toast.success).toHaveBeenCalledWith('Specific exam result linked'));
    expect(fixtures.api.post).toHaveBeenCalledExactlyOnceWith('/api/exam-cell/re-evaluations/app-1/exam-result', { exam_result_id: result.result_id });
    expect(screen.getByText('Original marks:').parentElement).toHaveTextContent('20');
    expect(screen.queryByText('Revised marks:')).not.toBeInTheDocument();
    expect(screen.getByText('Retained note')).toBeInTheDocument();
    expect(fixtures.queue).toEqual([expect.objectContaining({ original_marks: 20, revised_marks: null, status: 'ASSIGNED', report_notes: 'Retained note' })]);
  });

  it('retains the chosen result when linking fails and never treats that failure as publication', async () => {
    fixtures.api.post.mockRejectedValue(new Error('The selected result changed. Reload it.'));
    render(<ExamCellReEvaluationsPage />);
    await screen.findByRole('option', { name: /Spring 2026/ });
    fireEvent.change(resultSelect(), { target: { value: result.result_id } });
    fireEvent.click(linkButton());

    await waitFor(() => expect(fixtures.toast.error).toHaveBeenCalledWith('The selected result changed. Reload it.'));
    expect(resultSelect()).toHaveValue(result.result_id);
    expect(linkButton()).toBeEnabled();
    expect(publishButton()).toBeDisabled();
    expect(fixtures.toast.success).not.toHaveBeenCalled();
  });

  it.each(['changed-original', 'retarget-linked', 'retarget-assigned'])(
    'blocks a repair that would change the original snapshot or an existing reassessment link (%s)',
    async (reason) => {
      if (reason !== 'changed-original') fixtures.queue = [{ ...application, status: reason === 'retarget-assigned' ? 'ASSIGNED' : 'UNDER_REVIEW', exam_result_id: result.result_id, exam_link_status: 'linked', exam_max_marks: 40 }];
      fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('/faculty-roster') ? [] : path.endsWith('/exam-results')
        ? [result, { ...lowerResult, max_marks: 100, marks_obtained: reason === 'changed-original' ? 21 : 20 }]
        : fixtures.queue);
      render(<ExamCellReEvaluationsPage />);
      await screen.findByRole('option', { name: /Autumn 2026/ });
      expect(screen.getByRole('option', { name: /Autumn 2026/ })).toBeDisabled();
      expect(screen.getByRole('option', { name: /Autumn 2026/ })).toHaveTextContent(reason === 'changed-original' ? 'Original marks do not match' : 'already linked to a different exam');
      expect(linkButton()).toBeDisabled();
      expect(fixtures.api.post).not.toHaveBeenCalled();
    },
  );

  it('shows candidate read errors and retries that read without guessing a result', async () => {
    let fail = true;
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/faculty-roster')) return [];
      if (path.endsWith('/exam-results')) { if (fail) throw new Error('Candidates unavailable'); return [result]; }
      return fixtures.queue;
    });
    render(<ExamCellReEvaluationsPage />);
    await screen.findByText('Candidates unavailable');
    expect(publishButton()).toBeDisabled();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry exam results' }));

    await screen.findByRole('option', { name: /Spring 2026/ });
    expect(resultSelect()).toHaveValue('');
    expect(linkButton()).toBeDisabled();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('does not carry an older case result response or selection into another case', async () => {
    fixtures.queue = [application, { ...application, exam_application_id: 'app-2', student_name: 'Second Student', revised_marks: 5 }];
    let resolveOld!: (rows: typeof result[]) => void;
    const old = new Promise<typeof result[]>((resolve) => { resolveOld = resolve; });
    fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('/faculty-roster') ? [] : path.includes('/app-1/exam-results') ? old : path.endsWith('/exam-results') ? [lowerResult] : fixtures.queue);
    render(<ExamCellReEvaluationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Second Student/ }));
    await screen.findByRole('option', { name: /Autumn 2026/ });
    await act(async () => { resolveOld([result]); });

    expect(screen.queryByRole('option', { name: /Spring 2026/ })).not.toBeInTheDocument();
    expect(resultSelect()).toHaveValue('');
    expect(linkButton()).toBeDisabled();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null, 30], ['ambiguous', null, 30], ['invalid', 40, 30], ['linked', 20, 20.01],
  ])('blocks publication with %s linkage and maximum %s', async (status, maximum, revised) => {
    fixtures.queue = [{ ...application, exam_link_status: status, exam_max_marks: maximum, revised_marks: revised }];
    render(<ExamCellReEvaluationsPage />);
    await screen.findByRole('option', { name: /Spring 2026/ });
    expect(publishButton()).toBeDisabled();
    fireEvent.click(publishButton());
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('allows a genuine zero report within the exact scale and stays published if refresh fails', async () => {
    const zero = { ...application, exam_result_id: result.result_id, exam_link_status: 'linked', exam_max_marks: 40, exam_session: 'Spring 2026', exam_type: 'MID_TERM', revised_marks: 0 };
    let queueReads = 0;
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/faculty-roster')) return [];
      if (path.endsWith('/exam-results')) return [result];
      if (queueReads++ > 0) throw new Error('Queue refresh unavailable');
      return [zero];
    });
    render(<ExamCellReEvaluationsPage />);
    await screen.findByRole('option', { name: /Spring 2026/ });
    expect(publishButton()).toBeEnabled();
    fireEvent.click(publishButton());

    await screen.findByText('Queue refresh unavailable');
    expect(fixtures.api.post).toHaveBeenCalledExactlyOnceWith('/api/exam-cell/re-evaluations/app-1/publish', {});
    expect(screen.queryByRole('button', { name: 'Publish report to student & parent' })).not.toBeInTheDocument();
    expect(screen.getByText('Report published and shared with the student and linked parents.')).toBeInTheDocument();
  });
});
