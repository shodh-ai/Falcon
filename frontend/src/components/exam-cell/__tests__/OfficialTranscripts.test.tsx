import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '@/app/(portals)/exam-cell/transcripts/page';

const mock = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, role: 'ExamCell', success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mock.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { primaryRole: mock.role, role: 'ExamCell', roles: ['ExamCell'] } }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mock.success, error: mock.error } }));
const base = '/api/exam-cell/transcripts';
const generated = {
  transcript_id: 'transcript-a', student_user_id: 'student-a', student_name: 'Declared Student',
  enrollment_no: 'OFFICIAL-001', semester: 4, status: 'GENERATED', generated_at: '2026-10-24T09:00:00Z',
  approved_at: '2026-10-24T08:00:00Z', verification_code: 'VERIFY-001', pdf_url: 'https://private.invalid/not-public',
};
beforeEach(() => {
  vi.resetAllMocks(); mock.role = 'ExamCell';
  mock.api.get.mockResolvedValue([]);
  mock.api.post.mockResolvedValue({ semester: 4, requested: 1, transcript_ids: ['transcript-a'] });
});
async function open() {
  render(<Page />);
  await waitFor(() => expect(screen.queryByText('Loading official transcripts…')).not.toBeInTheDocument());
}
async function generate() { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Generate transcripts' })); }); }

describe('Official Transcripts real batch and metadata contracts', () => {
  it('loads actual generated metadata, keeps the existing design, and exposes no storage or DigiLocker links', async () => {
    mock.api.get.mockResolvedValue([generated]); await open();
    expect(mock.api.get).toHaveBeenCalledWith(base + '?semester=4');
    expect(screen.getByRole('heading', { name: 'Official Transcripts' })).toBeVisible();
    expect(screen.getByText('Declared Student')).toBeVisible();
    expect(screen.getByText(/OFFICIAL-001 · Semester 4/)).toBeVisible();
    expect(screen.getByText('Verification: VERIFY-001')).toBeVisible();
    expect(screen.getByText('Generated')).toBeVisible();
    expect(screen.queryByText(/DigiLocker|ABC ID/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('uses the batch summary object, then reloads metadata instead of treating it as a student array', async () => {
    await open(); mock.api.get.mockResolvedValue([generated]); await generate();
    await screen.findByText('Declared Student');
    expect(mock.api.post).toHaveBeenCalledWith(base + '/generate', { semester: 4 });
    expect(mock.api.get).toHaveBeenCalledTimes(2);
    expect(mock.success).toHaveBeenCalledWith('1 new transcript generated.');
    expect(screen.getByText('1 new transcript generated for semester 4.')).toBeVisible();
  });
  it('shows a genuine empty state when no generated records are available', async () => {
    await open();
    expect(screen.getByText(/No generated official transcripts are available for semester 4/)).toBeVisible();
    expect(mock.api.post).not.toHaveBeenCalled();
  });
  it('keeps existing generated records when the batch creates zero new transcripts', async () => {
    mock.api.get.mockResolvedValue([generated]);
    mock.api.post.mockResolvedValue({ semester: 4, requested: 0, transcript_ids: [] });
    await open(); await generate();
    await waitFor(() => expect(mock.success).toHaveBeenCalledWith('No new transcripts were generated. Existing records have been refreshed.'));
    expect(screen.getByText('Declared Student')).toBeVisible();
    expect(screen.getByText(/No new transcripts generated. Existing transcripts are retained/)).toBeVisible();
  });
  it('distinguishes zero new records with no eligible declared results', async () => {
    mock.api.post.mockResolvedValue({ semester: 4, requested: 0, transcript_ids: [] });
    await open(); await generate();
    await screen.findByText(/No new transcripts generated. Existing transcripts are retained/);
    expect(screen.getByText(/No generated official transcripts are available for semester 4/)).toBeVisible();
  });
  it('does not present requested, approved, failed, or incomplete rows as issued transcripts', async () => {
    mock.api.get.mockResolvedValue([
      { ...generated, transcript_id: 'pending', student_name: 'Pending Student', status: 'REQUESTED', generated_at: null },
      { ...generated, transcript_id: 'approved', student_name: 'Approved Student', status: 'APPROVED', generated_at: null },
      { ...generated, transcript_id: 'failed', student_name: 'Failed Student', status: 'FAILED', generated_at: null },
      { ...generated, transcript_id: 'broken', student_name: 'Incomplete Student', generated_at: null },
      generated,
    ]);
    await open(); expect(screen.getByText('Declared Student')).toBeVisible();
    for (const name of ['Pending Student', 'Approved Student', 'Failed Student', 'Incomplete Student']) expect(screen.queryByText(name)).not.toBeInTheDocument();
  });
  it('retains separate archived and generated metadata for the same student', async () => {
    mock.api.get.mockResolvedValue([generated, { ...generated, transcript_id: 'transcript-old', status: 'ARCHIVED', verification_code: 'VERIFY-OLD' }]);
    await open();
    expect(screen.getByText('Archived')).toBeVisible(); expect(screen.getByText('Verification: VERIFY-OLD')).toBeVisible();
    expect(screen.getByText('2 transcript records')).toBeVisible();
  });
  it('shows a safe load failure rather than a false empty state and supports retry', async () => {
    mock.api.get.mockRejectedValueOnce(new Error('SQL private details'));
    await open(); expect(screen.getByRole('alert')).toHaveTextContent('Unable to load official transcripts. Please retry.');
    expect(screen.queryByText(/No generated official transcripts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SQL private details/)).not.toBeInTheDocument();
    mock.api.get.mockResolvedValue([generated]); fireEvent.click(screen.getByRole('button', { name: 'Retry loading transcripts' }));
    expect(await screen.findByText('Declared Student')).toBeVisible(); expect(mock.api.post).not.toHaveBeenCalled();
  });
  it('reports generation/PDF failure without claiming success or revealing backend internals', async () => {
    mock.api.post.mockRejectedValue(new Error('PDF private object path and SQL error'));
    await open(); await generate();
    expect(await screen.findByRole('alert')).toHaveTextContent('Transcript generation did not complete. Refresh the list before retrying; some records may have been created.');
    expect(mock.success).not.toHaveBeenCalled(); expect(screen.queryByText(/private object/)).not.toBeInTheDocument();
  });
  it('retries only the list when generation succeeded but metadata loading failed', async () => {
    await open(); mock.api.get.mockRejectedValueOnce(new Error('List unavailable')); await generate();
    expect(await screen.findByRole('alert')).toHaveTextContent('The generation request completed, but transcript records could not be loaded.');
    expect(mock.success).not.toHaveBeenCalled();
    mock.api.get.mockResolvedValue([generated]); fireEvent.click(screen.getByRole('button', { name: 'Retry loading transcripts' }));
    expect(await screen.findByText('Declared Student')).toBeVisible(); expect(mock.api.post).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed or wrong-semester metadata without exposing records', async () => {
    mock.api.get.mockResolvedValue([{ ...generated, semester: 3 }]); await open();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load official transcripts.');
    expect(screen.queryByText('Declared Student')).not.toBeInTheDocument();
  });
  it('does not claim success for an incompatible batch response', async () => {
    mock.api.post.mockResolvedValue([generated]); await open(); await generate();
    expect(await screen.findByRole('alert')).toHaveTextContent('Transcript generation did not complete.');
    expect(mock.success).not.toHaveBeenCalled();
  });
  it('honors the active role rather than granting a secondary privileged role generation authority', async () => {
    mock.role = 'ExamOperator'; mock.api.get.mockResolvedValue([generated]); await open();
    expect(screen.queryByRole('button', { name: 'Generate transcripts' })).not.toBeInTheDocument();
    expect(screen.getByText('Your role can view transcripts but cannot generate them.')).toBeVisible();
    expect(screen.getByText('Declared Student')).toBeVisible(); expect(mock.api.post).not.toHaveBeenCalled();
  });
  it.each(['', '0', '-1', '2.5', 'wrong', '9007199254740992'])('rejects invalid semester %j without a request', async value => {
    await open(); fireEvent.change(screen.getByLabelText('Semester'), { target: { value } });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid semester number.');
    expect(screen.getByRole('button', { name: 'Generate transcripts' })).toBeDisabled();
    expect(mock.api.get).toHaveBeenCalledTimes(1); expect(mock.api.post).not.toHaveBeenCalled();
  });
  it('loads the selected semester and sends no client tenant, student, or approval identity', async () => {
    await open(); fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate transcripts' })).toBeEnabled());
    expect(mock.api.get).toHaveBeenLastCalledWith(base + '?semester=5');
    mock.api.post.mockResolvedValue({ semester: 5, requested: 0, transcript_ids: [] }); await generate();
    await waitFor(() => expect(mock.api.post).toHaveBeenCalledWith(base + '/generate', { semester: 5 }));
  });
  it('blocks duplicate generation clicks while the batch is pending', async () => {
    let finish!: (value: unknown) => void;
    mock.api.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await open(); await generate();
    const busy = screen.getByRole('button', { name: 'Generating…' });
    expect(busy).toBeDisabled(); expect(screen.getByLabelText('Semester')).toBeDisabled();
    fireEvent.click(busy); expect(mock.api.post).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ semester: 4, requested: 0, transcript_ids: [] }); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate transcripts' })).toBeEnabled());
  });
  it('ignores stale generation summaries and notifications after the active authentication scope changes', async () => {
    let finish!: (value: unknown) => void;
    mock.api.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<Page />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate transcripts' })).toBeEnabled());
    await generate();
    mock.role = 'ExamOperator'; view.rerender(<Page />);
    await waitFor(() => expect(screen.queryByText('Loading official transcripts…')).not.toBeInTheDocument());
    await act(async () => { finish({ semester: 4, requested: 1, transcript_ids: ['transcript-a'] }); });
    expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled();
    expect(screen.queryByText('1 new transcript generated for semester 4.')).not.toBeInTheDocument();
    expect(mock.api.get).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Generate transcripts' })).not.toBeInTheDocument();
  });
});
