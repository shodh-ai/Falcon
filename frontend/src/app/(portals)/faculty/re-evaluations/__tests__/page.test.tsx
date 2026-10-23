import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyReEvaluationsPage from '../page';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));
const firstCase = {
  exam_application_id: 'case-1', student_name: 'First Student', subject_name: 'Algorithms', subject_code: 'CS101', status: 'ASSIGNED', original_marks: 35,
  exam_result_id: 'result-1', exam_session: 'Spring 2026', exam_type: 'END_TERM', exam_max_marks: 100, exam_link_status: 'linked',
};
const secondCase = { ...firstCase, exam_application_id: 'case-2', student_name: 'Second Student', subject_code: 'CS102' };

vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/components/exam-cell/ReEvaluationQaPanel', () => ({ ReEvaluationQaPanel: () => <div>Local QA workflow</div> }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/lib/faculty-demo-mode', () => ({
  withFacultyDemoFallback: (live: unknown) => live,
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  isFacultyDemoSmokeId: () => false,
}));

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api = { get: vi.fn().mockResolvedValue([firstCase, secondCase]), post: vi.fn().mockResolvedValue({}) };
});
afterEach(cleanup);

function marksInput() {
  return screen.getByPlaceholderText('Revised marks');
}

function notesInput() {
  return screen.getByPlaceholderText('Reassessment notes, observations, and justification');
}

function submitButton() {
  return screen.getByRole('button', { name: 'Submit report to Exam Cell' });
}

function fillReport(marks = '45', notes = 'Rechecked each answer against the marking scheme.') {
  fireEvent.change(marksInput(), { target: { value: marks } });
  fireEvent.change(notesInput(), { target: { value: notes } });
}

async function loadFirstCase() {
  await screen.findByPlaceholderText('Revised marks');
}

describe('re-evaluation assignment reads', () => {
  it.each([
    ['a1000002-0000-4000-8000-000000000002', 'ASSIGNED', null],
    ['a1000003-0000-4000-8000-000000000003', 'UNDER_REVIEW', '46.00'],
  ])('preserves seeded demo request %s as a read-only example', async (id, status, revised_marks) => {
    const demo = { ...firstCase, exam_application_id: id, student_name: 'Student Four', subject_code: 'SMOKE101', status, original_marks: '42.00', revised_marks, report_notes: 'Existing demo note', exam_result_id: null, exam_max_marks: null, exam_link_status: 'missing' };
    fixtures.api.get.mockResolvedValue([demo]);
    render(<FacultyReEvaluationsPage />);

    await screen.findByRole('note', { name: 'Read-only demo request' });
    expect(screen.getByText('Original marks:').parentElement).toHaveTextContent('42.00');
    expect(screen.queryByRole('button', { name: 'Submit report to Exam Cell' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Revised marks')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    if (revised_marks !== null) {
      expect(screen.getByText('Saved demo report')).toBeInTheDocument();
      expect(screen.getByText('Revised marks: 46.00')).toBeInTheDocument();
      expect(screen.getByText('Existing demo note')).toBeInTheDocument();
    }
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(demo).toMatchObject({ original_marks: '42.00', revised_marks, status, exam_result_id: null });
  });

  it('shows the report form for another SMOKE101 request after viewing the read-only seed', async () => {
    fixtures.api.get.mockResolvedValue([
      { ...firstCase, exam_application_id: 'a1000002-0000-4000-8000-000000000002', subject_code: 'SMOKE101', student_name: 'Student Four' },
      { ...firstCase, subject_code: 'SMOKE101' },
    ]);
    render(<FacultyReEvaluationsPage />);
    await screen.findByRole('note', { name: 'Read-only demo request' });
    fireEvent.click(screen.getByRole('button', { name: /First Student/ }));

    expect(screen.queryByRole('note', { name: 'Read-only demo request' })).not.toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('shows loading before a response and only shows an empty state after a successful empty read', async () => {
    let resolveCases!: (rows: typeof firstCase[]) => void;
    fixtures.api.get.mockReturnValue(new Promise<typeof firstCase[]>((resolve) => { resolveCases = resolve; }));
    render(<FacultyReEvaluationsPage />);

    expect(screen.getByText('Loading re-evaluation assignments…')).toBeInTheDocument();
    expect(screen.queryByText('No re-evaluation assignments yet.')).not.toBeInTheDocument();
    await act(async () => { resolveCases([]); });
    expect(screen.getByText('No re-evaluation assignments yet.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a read failure with Retry instead of claiming there are no assignments', async () => {
    fixtures.api.get.mockRejectedValueOnce(new Error('Assignments unavailable'));
    render(<FacultyReEvaluationsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Assignments unavailable');
    expect(screen.queryByText('No re-evaluation assignments yet.')).not.toBeInTheDocument();
    fixtures.api.get.mockResolvedValue([firstCase]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await loadFirstCase();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fixtures.api.get).toHaveBeenCalledTimes(2);
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('ignores an obsolete response after the active API scope changes', async () => {
    let resolveOld!: (rows: typeof firstCase[]) => void;
    fixtures.api.get.mockReturnValue(new Promise<typeof firstCase[]>((resolve) => { resolveOld = resolve; }));
    const view = render(<FacultyReEvaluationsPage />);
    fixtures.api = { get: vi.fn().mockResolvedValue([secondCase]), post: vi.fn() };
    view.rerender(<FacultyReEvaluationsPage />);
    await screen.findByRole('button', { name: /Second Student/ });

    await act(async () => { resolveOld([firstCase]); });
    expect(screen.queryByRole('button', { name: /First Student/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Second Student/ })).toBeInTheDocument();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('does not refresh or replace the new account after an old account submit finishes', async () => {
    let resolveOldSubmit!: (result: object) => void;
    const oldApi = fixtures.api;
    oldApi.get.mockResolvedValue([firstCase]);
    oldApi.post.mockReturnValue(new Promise<object>((resolve) => { resolveOldSubmit = resolve; }));
    const view = render(<FacultyReEvaluationsPage />);
    await loadFirstCase();
    fillReport('45', 'Old account report');
    fireEvent.click(submitButton());
    expect(oldApi.post).toHaveBeenCalledTimes(1);

    fixtures.api = { get: vi.fn().mockResolvedValue([secondCase]), post: vi.fn().mockResolvedValue({}) };
    const newApi = fixtures.api;
    view.rerender(<FacultyReEvaluationsPage />);
    await screen.findByRole('button', { name: /Second Student/ });
    expect(marksInput()).toHaveValue(null);
    expect(notesInput()).toHaveValue('');
    fillReport('55', 'New account draft');
    expect(submitButton()).toBeEnabled();
    await act(async () => { resolveOldSubmit({}); });

    expect(oldApi.get).toHaveBeenCalledTimes(1);
    expect(newApi.get).toHaveBeenCalledTimes(1);
    expect(newApi.post).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /First Student/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Second Student/ })).toBeEnabled();
    expect(marksInput()).toHaveValue(55);
    expect(notesInput()).toHaveValue('New account draft');
    expect(submitButton()).toBeEnabled();
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(fixtures.toast.error).not.toHaveBeenCalled();
  });
});

describe('re-evaluation report drafts', () => {
  it('preserves separate unfinished marks and notes when switching cases without refetching', async () => {
    render(<FacultyReEvaluationsPage />);
    await loadFirstCase();
    fillReport('45', 'First case draft');
    fireEvent.click(screen.getByRole('button', { name: /Second Student/ }));
    expect(marksInput()).toHaveValue(null);
    expect(notesInput()).toHaveValue('');
    fillReport('55', 'Second case draft');
    fireEvent.click(screen.getByRole('button', { name: /First Student/ }));
    expect(marksInput()).toHaveValue(45);
    expect(notesInput()).toHaveValue('First case draft');
    fireEvent.click(screen.getByRole('button', { name: /Second Student/ }));
    expect(marksInput()).toHaveValue(55);
    expect(notesInput()).toHaveValue('Second case draft');
    expect(fixtures.api.get).toHaveBeenCalledTimes(1);
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('rejects a blank mark without converting it into zero, then accepts a genuine zero', async () => {
    render(<FacultyReEvaluationsPage />);
    await loadFirstCase();
    fillReport('', '  Rechecked answer sheet.  ');
    fireEvent.click(submitButton());
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(fixtures.toast.error).toHaveBeenCalledWith('Enter valid revised marks');

    fireEvent.change(marksInput(), { target: { value: '0' } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(fixtures.api.post).toHaveBeenCalledExactlyOnceWith(
      '/api/academics/faculty/re-evaluations/case-1/report',
      { revised_marks: 0, report_notes: 'Rechecked answer sheet.' },
    ));
  });

  it('rejects whitespace-only or overlong reassessment notes', async () => {
    render(<FacultyReEvaluationsPage />);
    await loadFirstCase();
    fillReport('45', '   ');
    fireEvent.click(submitButton());
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(fixtures.toast.error).toHaveBeenCalledWith('Add reassessment notes');
    fillReport('45', 'x'.repeat(2001));
    fireEvent.click(submitButton());
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(notesInput()).toHaveAttribute('maxLength', '2000');
  });

  it.each(['-1', '10000', '1.234'])(
    'rejects a revised mark outside the supported storage precision or range (%s)',
    async (marks) => {
      render(<FacultyReEvaluationsPage />);
      await loadFirstCase();
      fillReport(marks);
      fireEvent.click(submitButton());

      expect(fixtures.api.post).not.toHaveBeenCalled();
      expect(marksInput()).toHaveAttribute('min', '0');
      expect(marksInput()).toHaveAttribute('step', '0.01');
      expect(marksInput()).toHaveAttribute('max', '100');
    },
  );

  it('preserves a failed report draft for retry rather than marking it submitted', async () => {
    fixtures.api.post.mockRejectedValueOnce(new Error('Report service unavailable'));
    render(<FacultyReEvaluationsPage />);
    await loadFirstCase();
    fillReport('45', 'Draft to keep after failure');
    fireEvent.click(submitButton());

    await waitFor(() => expect(fixtures.toast.error).toHaveBeenCalledWith('Report service unavailable'));
    expect(marksInput()).toHaveValue(45);
    expect(notesInput()).toHaveValue('Draft to keep after failure');
    expect(submitButton()).toBeEnabled();
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(fixtures.api.get).toHaveBeenCalledTimes(1);
  });

  it('locks the case and inputs and prevents two same-tick POST requests', async () => {
    let resolveSubmit!: (result: object) => void;
    fixtures.api.post.mockReturnValue(new Promise<object>((resolve) => { resolveSubmit = resolve; }));
    render(<FacultyReEvaluationsPage />);
    await loadFirstCase();
    fillReport();
    const submit = submitButton();
    act(() => { fireEvent.click(submit); fireEvent.click(submit); });

    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Submitting report…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Second Student/ })).toBeDisabled();
    expect(marksInput()).toBeDisabled();
    expect(notesInput()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Second Student/ }));
    expect(marksInput()).toHaveValue(45);
    await act(async () => { resolveSubmit({}); });
  });

  it('keeps a successfully submitted case locked when refreshing the list fails', async () => {
    fixtures.api.get.mockResolvedValueOnce([firstCase]).mockRejectedValueOnce(new Error('Refresh unavailable'));
    render(<FacultyReEvaluationsPage />);
    await loadFirstCase();
    fillReport('45', 'Submitted report notes');
    fireEvent.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(screen.getByText('Submitted report', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Revised marks: 45/)).toBeInTheDocument();
    expect(screen.getByText('Submitted report notes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit report to Exam Cell' })).not.toBeInTheDocument();
    expect(fixtures.toast.success).toHaveBeenCalledExactlyOnceWith('Reassessment report submitted to Exam Cell');
    expect(fixtures.toast.error).not.toHaveBeenCalled();
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
  });
});

describe('re-evaluation report visibility', () => {
  it.each([
    ['UNDER_REVIEW', 'Submitted report'],
    ['COMPLETED', 'Published report'],
  ])('shows revised marks for %s even if the report notes are empty', async (status, heading) => {
    fixtures.api.get.mockResolvedValue([{ ...firstCase, status, revised_marks: 0, report_notes: '' }]);
    render(<FacultyReEvaluationsPage />);

    await screen.findByText(heading, { exact: true });
    expect(screen.getByText(/Revised marks: 0/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit report to Exam Cell' })).not.toBeInTheDocument();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('shows missing original marks as unrecorded while retaining a genuine original zero', async () => {
    fixtures.api.get.mockResolvedValue([{ ...firstCase, original_marks: null }, { ...secondCase, original_marks: 0 }]);
    render(<FacultyReEvaluationsPage />);
    await loadFirstCase();

    expect(screen.getByText(/Original marks:/).parentElement).toHaveTextContent('Not recorded');
    fireEvent.click(screen.getByRole('button', { name: /Second Student/ }));
    expect(screen.getByText(/Original marks:/).parentElement).toHaveTextContent('0');
    expect(screen.queryByText('Not recorded')).not.toBeInTheDocument();
  });
});

describe('specific exam marking scale', () => {
  it('labels a linked result without a session name as published instead of unlinked', async () => {
    fixtures.api.get.mockResolvedValue([{ ...firstCase, exam_session: null }]);
    render(<FacultyReEvaluationsPage />);
    await loadFirstCase();
    expect(screen.getByText('Exam:').parentElement).toHaveTextContent('Published exam result · END TERM');
    expect(screen.queryByText('Exam not linked')).not.toBeInTheDocument();
    expect(screen.queryByText('Not linked')).not.toBeInTheDocument();
  });

  it.each([
    ['missing', null], ['ambiguous', null], ['invalid', 100], ['linked', 0], ['resolved', null],
  ])('blocks submission when the exam linkage is %s with maximum %s', async (status, maximum) => {
    fixtures.api.get.mockResolvedValue([{ ...firstCase, exam_link_status: status, exam_max_marks: maximum, exam_link_message: 'Exam Cell must select the exact result.' }]);
    render(<FacultyReEvaluationsPage />);
    await loadFirstCase();
    expect(screen.getByRole('alert')).toHaveTextContent('Exam Cell must select the exact result.');
    expect(submitButton()).toBeDisabled();
    fireEvent.click(submitButton());
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('shows the selected exam and enforces its exact maximum while allowing zero', async () => {
    fixtures.api.get.mockResolvedValue([{ ...firstCase, exam_max_marks: 20 }]);
    render(<FacultyReEvaluationsPage />);
    await loadFirstCase();
    expect(screen.getByText('Maximum marks:').parentElement).toHaveTextContent('20');
    expect(screen.getByText('Exam:').parentElement).toHaveTextContent('Spring 2026 · END TERM');
    expect(marksInput()).toHaveAttribute('max', '20');
    fillReport('20.01');
    fireEvent.click(submitButton());
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(fixtures.toast.error).toHaveBeenCalledWith('Revised marks cannot exceed the exam maximum of 20');
    fireEvent.change(marksInput(), { target: { value: '0' } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(fixtures.api.post).toHaveBeenCalledWith(
      '/api/academics/faculty/re-evaluations/case-1/report',
      { revised_marks: 0, report_notes: 'Rechecked each answer against the marking scheme.' },
    ));
  });
});
