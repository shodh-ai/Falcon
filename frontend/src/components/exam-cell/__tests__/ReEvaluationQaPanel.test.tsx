import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReEvaluationQaPanel } from '../ReEvaluationQaPanel';

const f = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
const id = 'a1000002-0000-4000-8000-000000000002';
const qa = { request_id: id, qa_result_id: 'b2000002-0000-4000-8000-000000000002', source: 'LOCAL_QA', is_qa: true,
  official_publication: false, exam_session: 'LOCAL QA / Assigned scenario', exam_type: 'END_TERM', original_marks: '42.00',
  max_marks: '100.00', result_marks: '42.00', revised_marks: null, status: 'ASSIGNED', report_notes: null, version: 0 };
vi.mock('@/lib/api', () => ({ useAuthedApi: () => f.api }));
beforeEach(() => { f.api = { get: vi.fn().mockResolvedValue(qa), post: vi.fn() }; });
afterEach(cleanup);

describe('separate local QA workflow', () => {
  it('submits only to the QA endpoint with the fixture version and blocks duplicate clicks', async () => {
    let finish!: (value: object) => void;
    f.api.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<ReEvaluationQaPanel applicationId={id} audience="faculty" />);
    fireEvent.change(await screen.findByLabelText('QA revised marks'), { target: { value: '46' } });
    fireEvent.change(screen.getByLabelText('QA reassessment notes'), { target: { value: ' Local QA reassessment ' } });
    const button = screen.getByRole('button', { name: 'Submit QA report' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(f.api.post).toHaveBeenCalledExactlyOnceWith(`/api/qa/re-evaluations/${id}/report`,
      { expected_version: 0, revised_marks: 46, report_notes: 'Local QA reassessment' });
    await act(async () => { finish({ ...qa, status: 'UNDER_REVIEW', revised_marks: 46, version: 1 }); });
    expect(screen.getByText('Awaiting review in the Exam Cell local QA workflow.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit QA report' })).not.toBeInTheDocument();
  });

  it('lets an invalid mark be corrected without losing the draft or querying official APIs', async () => {
    f.api.post.mockResolvedValue({ ...qa, status: 'UNDER_REVIEW', revised_marks: 46, version: 1 });
    render(<ReEvaluationQaPanel applicationId={id} audience="faculty" />);
    const input = await screen.findByLabelText('QA revised marks');
    fireEvent.change(input, { target: { value: '101' } });
    fireEvent.change(screen.getByLabelText('QA reassessment notes'), { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit QA report' }));
    expect(screen.getByRole('alert')).toHaveTextContent('from 0 to 100.00');
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: '46' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit QA report' }));
    await waitFor(() => expect(f.api.post).toHaveBeenCalledTimes(1));
    expect(f.api.post.mock.calls[0][1].report_notes).toBe('Keep this draft');
    expect(f.api.get).toHaveBeenCalledExactlyOnceWith(`/api/qa/re-evaluations/${id}`);
  });

  it('completes and resets the QA scenario without using official publication', async () => {
    const review = { ...qa, status: 'UNDER_REVIEW', revised_marks: '46.00', version: 1 };
    f.api.get.mockResolvedValue(review);
    f.api.post.mockResolvedValueOnce({ ...review, status: 'COMPLETED', result_marks: '46.00', version: 2 }).mockResolvedValueOnce(qa);
    render(<ReEvaluationQaPanel applicationId={id} audience="exam-cell" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete QA simulation' }));
    await screen.findByText('QA scenario completed. This is not an official publication.');
    fireEvent.click(screen.getByRole('button', { name: 'Reset QA scenario' }));
    await screen.findByText('The assigned faculty member submits the QA report from Faculty → Re-evaluation.');
    expect(f.api.post.mock.calls.map(([path]) => path)).toEqual([`/api/qa/re-evaluations/${id}/complete`, `/api/qa/re-evaluations/${id}/reset`]);
  });

  it('keeps a failed mutation draft and requires a fresh read before retrying a stale version', async () => {
    f.api.post.mockRejectedValue(new Error('The QA case changed. Reload it before trying again.'));
    render(<ReEvaluationQaPanel applicationId={id} audience="faculty" />);
    fireEvent.change(await screen.findByLabelText('QA revised marks'), { target: { value: '46' } });
    fireEvent.change(screen.getByLabelText('QA reassessment notes'), { target: { value: 'Retain on error' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit QA report' }));
    await screen.findByText('The QA case changed. Reload it before trying again.');
    expect(screen.getByLabelText('QA revised marks')).toHaveValue(46);
    expect(screen.getByRole('button', { name: 'Submit QA report' })).toBeDisabled();
    expect(f.api.post).toHaveBeenCalledTimes(1);
  });

  it('offers only a reload when QA is disabled and rejects data from another request', async () => {
    f.api.get.mockRejectedValueOnce(new Error('Local re-evaluation QA workflow is unavailable.')).mockResolvedValueOnce({ ...qa, request_id: 'another-case' });
    render(<ReEvaluationQaPanel applicationId={id} audience="faculty" />);
    await screen.findByText('Local re-evaluation QA workflow is unavailable.');
    fireEvent.click(screen.getByRole('button', { name: 'Reload QA scenario' }));
    await screen.findByText('The local QA fixture is unavailable or invalid.');
    expect(screen.queryByLabelText('QA revised marks')).not.toBeInTheDocument();
    expect(f.api.post).not.toHaveBeenCalled();
  });

  it('preserves a failed draft after reloading the same QA version and then retries only that draft', async () => {
    f.api.post.mockRejectedValueOnce(new Error('QA connection unavailable'))
      .mockResolvedValueOnce({ ...qa, status: 'UNDER_REVIEW', revised_marks: 46, report_notes: 'Keep after reload', version: 1 });
    render(<ReEvaluationQaPanel applicationId={id} audience="faculty" />);
    fireEvent.change(await screen.findByLabelText('QA revised marks'), { target: { value: '46' } });
    fireEvent.change(screen.getByLabelText('QA reassessment notes'), { target: { value: 'Keep after reload' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit QA report' }));
    await screen.findByText('QA connection unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Reload QA scenario' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit QA report' })).toBeEnabled());
    expect(screen.getByLabelText('QA revised marks')).toHaveValue(46);
    expect(screen.getByLabelText('QA reassessment notes')).toHaveValue('Keep after reload');
    fireEvent.click(screen.getByRole('button', { name: 'Submit QA report' }));
    await screen.findByText('Awaiting review in the Exam Cell local QA workflow.');
    expect(f.api.post).toHaveBeenCalledTimes(2);
    expect(f.api.post.mock.calls[1][1]).toEqual({ expected_version: 0, revised_marks: 46, report_notes: 'Keep after reload' });
  });

  it('ignores an old account read when the API identity changes', async () => {
    let finish!: (value: object) => void;
    f.api.get.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<ReEvaluationQaPanel applicationId={id} audience="faculty" />);
    f.api = { get: vi.fn().mockRejectedValue(new Error('Not assigned to this account')), post: vi.fn() };
    view.rerender(<ReEvaluationQaPanel applicationId={id} audience="faculty" />);
    await screen.findByText('Not assigned to this account');
    await act(async () => { finish(qa); });
    expect(screen.queryByLabelText('QA revised marks')).not.toBeInTheDocument();
  });
});
