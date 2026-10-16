import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentAssignmentsTab } from '@/components/lms/StudentAssignmentsTab';
import type { StudentAssignmentRow } from '@/lib/api/lms';

const mocks = vi.hoisted(() => ({ postMultipart: vi.fn(), getBlobUrlWithAuth: vi.fn(), revokeObjectURL: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'student-test-token' }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/lib/api/lms', () => ({
  postMultipart: mocks.postMultipart,
  formatDeadlineCountdown: () => 'Assignment deadline',
  downloadWithAuth: vi.fn(),
  getBlobUrlWithAuth: mocks.getBlobUrlWithAuth,
}));

function row(overrides: Partial<StudentAssignmentRow> = {}): StudentAssignmentRow {
  return {
    assignment: { assignment_id: 'assignment-1', title: 'Programming Exercise', start_date: '2020-01-01T00:00:00Z',
      due_date: '2099-10-20T18:29:00Z', max_marks: 20, has_reference_file: false },
    submission: null, status: 'PENDING', ...overrides,
  };
}

function openAndSelectPdf() {
  fireEvent.click(screen.getByRole('button', { name: 'Upload Assignment', exact: true }));
  const file = new File(['%PDF-1.4\nSynthetic test PDF'], 'test-solution.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Browse files'), { target: { files: [file] } });
  return file;
}

function submitted(status: 'SUBMITTED' | 'GRADED' | 'RETURNED_FOR_REVISION' = 'SUBMITTED') {
  return row({ status, submission: { submission_id: 'submission-1', submitted_at: '2026-10-15T05:01:53Z',
    marks_awarded: status === 'GRADED' ? '16.00' : null, faculty_remarks: null } });
}

beforeEach(() => {
  vi.stubGlobal('URL', class extends URL { static revokeObjectURL = mocks.revokeObjectURL; });
  mocks.getBlobUrlWithAuth.mockReset().mockResolvedValue('blob:private-submission-preview');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Student assignment upload action', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.postMultipart.mockResolvedValue({}); });

  it.each(['PENDING', 'RETURNED_FOR_REVISION'] as const)('aligns %s details and upload actions in one desktop row with a full-width expanded panel', (status) => {
    render(<StudentAssignmentsTab assignments={[row({ status, can_resubmit: true })]} onSubmitted={vi.fn()} />);
    const upload = screen.getByRole('button', { name: status === 'PENDING' ? 'Upload Assignment' : 'Re-upload Assignment', exact: true });
    const actions = upload.parentElement!;
    const card = actions.parentElement!;
    expect(card).toHaveClass('grid', 'gap-3', 'sm:grid-cols-[minmax(0,1fr)_auto]', 'sm:items-center');
    expect(actions).not.toHaveClass('mt-3');
    expect(actions).toHaveClass('w-full', 'sm:w-auto');
    expect(screen.getByText('Programming Exercise')).toHaveClass('break-words');
    fireEvent.click(upload);
    expect(document.getElementById(upload.getAttribute('aria-controls')!)).toHaveClass('sm:col-span-2');
    expect(document.querySelector('button button')).toBeNull();
  });

  it('omits pending headings and badges on every assignment card while keeping upload actions', () => {
    const second = row({ assignment: { ...row().assignment, assignment_id: 'assignment-2', title: 'Database Exercise' } });
    render(<StudentAssignmentsTab assignments={[row(), second]} onSubmitted={vi.fn()} />);
    expect(screen.queryAllByText(/^pending$/i)).toHaveLength(0);
    const uploads = screen.getAllByRole('button', { name: 'Upload Assignment', exact: true });
    expect(uploads).toHaveLength(2);
    uploads.forEach((upload) => expect(upload).toBeEnabled());
    fireEvent.click(uploads[1]);
    expect(screen.getByLabelText('Browse files')).toBeVisible();
    expect(screen.queryAllByText(/^pending$/i)).toHaveLength(0);
  });

  it('shows an accessible upload button on a closed card without requiring a title click', () => {
    render(<StudentAssignmentsTab assignments={[row()]} onSubmitted={vi.fn()} />);
    const upload = screen.getByRole('button', { name: 'Upload Assignment', exact: true });
    expect(upload).toBeVisible();
    expect(upload).toHaveAttribute('type', 'button');
    expect(upload).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Upload Solution PDF')).not.toBeInTheDocument();
    fireEvent.click(upload);
    expect(upload).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(upload.getAttribute('aria-controls')!)).toBeInTheDocument();
    expect(screen.getByText('Upload Solution PDF')).toBeVisible();
    expect(screen.getByLabelText('Browse files')).toHaveAttribute('accept', '.pdf,application/pdf');
    expect(document.querySelector('button button')).toBeNull();
    expect(mocks.postMultipart).not.toHaveBeenCalled();
  });

  it('does not close the upload area or clear the selected file when clicked again', () => {
    render(<StudentAssignmentsTab assignments={[row()]} onSubmitted={vi.fn()} />);
    openAndSelectPdf();
    fireEvent.click(screen.getByRole('button', { name: 'Upload Assignment', exact: true }));
    expect(screen.getByText('Selected: test-solution.pdf')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit assignment', exact: true })).toBeEnabled();
  });

  it('uses the existing authenticated PDF submission and refresh callback', async () => {
    const onSubmitted = vi.fn();
    render(<StudentAssignmentsTab assignments={[row()]} onSubmitted={onSubmitted} />);
    const file = openAndSelectPdf();
    fireEvent.click(screen.getByRole('button', { name: 'Submit assignment', exact: true }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(mocks.postMultipart).toHaveBeenCalledWith('/api/academics/assignments/assignment-1/submit', 'student-test-token', expect.any(FormData));
    expect(mocks.postMultipart.mock.calls[0][2].get('file').name).toBe(file.name);
    expect(mocks.success).toHaveBeenCalledWith('Assignment submitted');
    expect(screen.getByRole('button', { name: 'Upload Assignment', exact: true })).toHaveAttribute('aria-expanded', 'false');
  });

  it('retains the selected PDF and shows the existing error when submission fails', async () => {
    mocks.postMultipart.mockRejectedValueOnce(new Error('Upload failed'));
    const onSubmitted = vi.fn();
    render(<StudentAssignmentsTab assignments={[row()]} onSubmitted={onSubmitted} />);
    openAndSelectPdf();
    fireEvent.click(screen.getByRole('button', { name: 'Submit assignment', exact: true }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Upload failed'));
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(screen.getByText('Selected: test-solution.pdf')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit assignment', exact: true })).toBeEnabled();
  });

  it('disables the upload action while the existing submission request is in progress', async () => {
    let finish!: (value: object) => void;
    mocks.postMultipart.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const onSubmitted = vi.fn();
    render(<StudentAssignmentsTab assignments={[row()]} onSubmitted={onSubmitted} />);
    openAndSelectPdf();
    fireEvent.click(screen.getByRole('button', { name: 'Submit assignment', exact: true }));
    expect(screen.getByRole('button', { name: 'Upload Assignment', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submitting…', exact: true })).toBeDisabled();
    await act(async () => finish({}));
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it('keeps expired pending assignments locked with a visible explanation', () => {
    const expired = row();
    expired.assignment.due_date = '2000-01-01T00:00:00Z';
    render(<StudentAssignmentsTab assignments={[expired]} onSubmitted={vi.fn()} />);
    const upload = screen.getByRole('button', { name: 'Upload Assignment', exact: true });
    expect(upload).toBeDisabled();
    expect(upload).toHaveAccessibleDescription('Deadline has passed for uploading solutions.');
    fireEvent.click(upload);
    expect(screen.queryByLabelText('Browse files')).not.toBeInTheDocument();
  });

  it('allows faculty-authorized revision uploads after the original deadline', () => {
    const revision = row({ status: 'RETURNED_FOR_REVISION', can_resubmit: true });
    revision.assignment.due_date = '2000-01-01T00:00:00Z';
    render(<StudentAssignmentsTab assignments={[revision]} onSubmitted={vi.fn()} />);
    const upload = screen.getByRole('button', { name: 'Re-upload Assignment', exact: true });
    expect(upload).toBeEnabled();
    fireEvent.click(upload);
    expect(screen.getByText('Check and Re-Upload')).toBeVisible();
    expect(screen.getByLabelText('Browse files')).toBeInTheDocument();
  });

  it('keeps a closed revision window locked', () => {
    render(<StudentAssignmentsTab assignments={[row({ status: 'RETURNED_FOR_REVISION', can_resubmit: false })]} onSubmitted={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Re-upload Assignment', exact: true })).toBeDisabled();
    expect(screen.getByText('The re-upload window is closed.')).toBeVisible();
    expect(screen.queryByLabelText('Browse files')).not.toBeInTheDocument();
  });

  it.each(['SUBMITTED', 'GRADED', 'OVERDUE'] as const)('does not add an upload action to %s records', (status) => {
    render(<StudentAssignmentsTab assignments={[row({ status })]} onSubmitted={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^(Upload|Re-upload) Assignment$/ })).not.toBeInTheDocument();
  });

  it.each(['not-a-pdf.txt', 'too-large.pdf'])('preserves PDF restrictions for %s', (name) => {
    render(<StudentAssignmentsTab assignments={[row()]} onSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload Assignment', exact: true }));
    const file = new File(['test'], name, { type: name.endsWith('.pdf') ? 'application/pdf' : 'text/plain' });
    if (name === 'too-large.pdf') Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText('Browse files'), { target: { files: [file] } });
    expect(screen.queryByRole('button', { name: 'Submit assignment', exact: true })).not.toBeInTheDocument();
    expect(mocks.postMultipart).not.toHaveBeenCalled();
  });
});

describe('Student submitted PDF preview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('places one preview action in the submitted card header instead of the submitted badge and footer', () => {
    render(<StudentAssignmentsTab assignments={[submitted()]} onSubmitted={vi.fn()} />);
    const preview = screen.getByRole('button', { name: 'Preview Submission', exact: true });
    const header = screen.getByText('Programming Exercise').parentElement!.parentElement!;
    expect(header.lastElementChild).toContainElement(preview);
    expect(header.nextElementSibling).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Preview Submission', exact: true })).toHaveLength(1);
    expect(screen.queryByText('SUBMITTED', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText(/^Submitted \d/)).toBeVisible();
  });

  it('keeps marks and the preview action without the graded badge', () => {
    render(<StudentAssignmentsTab assignments={[submitted('GRADED')]} onSubmitted={vi.fn()} />);
    const preview = screen.getByRole('button', { name: 'Preview Submission', exact: true });
    const header = screen.getByText('Programming Exercise').parentElement!.parentElement!;
    expect(header.lastElementChild).toContainElement(preview);
    expect(screen.queryByText('GRADED', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('Marks scored: 16.00/20')).toBeVisible();
  });

  it('does not restore the graded badge when submission details are unavailable', () => {
    render(<StudentAssignmentsTab assignments={[row({ status: 'GRADED' })]} onSubmitted={vi.fn()} />);
    expect(screen.queryByText('GRADED', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview Submission', exact: true })).not.toBeInTheDocument();
    expect(mocks.postMultipart).not.toHaveBeenCalled();
  });

  it.each(['SUBMITTED', 'GRADED'] as const)('previews the student solution, not the question paper, for %s work', async (status) => {
    render(<StudentAssignmentsTab assignments={[submitted(status)]} onSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Submission', exact: true }));
    expect(await screen.findByRole('dialog', { name: 'Programming Exercise - Your Submission' })).toBeVisible();
    expect(mocks.getBlobUrlWithAuth).toHaveBeenCalledWith('/api/academics/student/assignments/assignment-1/submission/download', 'student-test-token');
    expect(screen.getByTitle('Submitted assignment PDF')).toHaveAttribute('src', 'blob:private-submission-preview');
    expect(screen.getByRole('link', { name: 'Open PDF in new tab' })).toHaveAttribute('href', 'blob:private-submission-preview');
    expect(mocks.postMultipart).not.toHaveBeenCalled();
  });

  it('does not offer a submission preview when no submission exists', () => {
    render(<StudentAssignmentsTab assignments={[row(), row({ assignment: { ...row().assignment, assignment_id: 'missing', title: 'Not submitted' }, status: 'OVERDUE' })]} onSubmitted={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Preview Submission', exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('OVERDUE', { exact: true })).toBeVisible();
    expect(screen.getByText('Not submitted (overdue)')).toBeVisible();
  });

  it('allows a returned assignment to preview the previous upload without replacing it', async () => {
    render(<StudentAssignmentsTab assignments={[{ ...submitted('RETURNED_FOR_REVISION'), can_resubmit: true }]} onSubmitted={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Re-upload Assignment', exact: true })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Submission', exact: true }));
    expect(await screen.findByRole('dialog', { name: 'Programming Exercise - Your Submission' })).toBeVisible();
    expect(mocks.postMultipart).not.toHaveBeenCalled();
  });

  it('shows a safe retryable error instead of opening a broken preview', async () => {
    mocks.getBlobUrlWithAuth.mockRejectedValueOnce(new Error('Private storage detail'));
    render(<StudentAssignmentsTab assignments={[submitted()]} onSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Submission', exact: true }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Could not preview your submission. Please try again.'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Private storage detail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview Submission', exact: true })).toBeEnabled();
  });

  it('shows a loading state and prevents duplicate preview requests', async () => {
    let finish!: (value: string) => void;
    mocks.getBlobUrlWithAuth.mockReturnValueOnce(new Promise<string>((resolve) => { finish = resolve; }));
    render(<StudentAssignmentsTab assignments={[submitted()]} onSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Submission', exact: true }));
    expect(screen.getByRole('button', { name: 'Loading preview…', exact: true })).toBeDisabled();
    await act(async () => finish('blob:loaded-submission'));
    expect(screen.getByTitle('Submitted assignment PDF')).toHaveAttribute('src', 'blob:loaded-submission');
    expect(mocks.getBlobUrlWithAuth).toHaveBeenCalledTimes(1);
  });

  it('releases the private PDF URL when the preview is closed', async () => {
    render(<StudentAssignmentsTab assignments={[submitted()]} onSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Submission', exact: true }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:private-submission-preview');
  });

  it('releases the private PDF URL when navigating away', async () => {
    const view = render(<StudentAssignmentsTab assignments={[submitted()]} onSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Submission', exact: true }));
    await screen.findByRole('dialog');
    view.unmount();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:private-submission-preview');
  });

  it('does not open a late PDF response after the assignment component unmounts', async () => {
    let finish!: (value: string) => void;
    mocks.getBlobUrlWithAuth.mockReturnValueOnce(new Promise<string>((resolve) => { finish = resolve; }));
    const view = render(<StudentAssignmentsTab assignments={[submitted()]} onSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Submission', exact: true }));
    view.unmount();
    await act(async () => finish('blob:late-private-submission'));
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:late-private-submission');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the original faculty question-paper preview separate', async () => {
    const assignment = row();
    assignment.assignment.has_reference_file = true;
    render(<StudentAssignmentsTab assignments={[assignment]} onSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload Assignment', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'View PDF', exact: true }));
    expect(await screen.findByRole('dialog', { name: 'Programming Exercise - Question Paper' })).toBeVisible();
    expect(mocks.getBlobUrlWithAuth).toHaveBeenCalledWith('/api/academics/student/assignments/assignment-1/download', 'student-test-token');
    expect(screen.getByTitle('PDF Preview')).toBeInTheDocument();
  });
});
