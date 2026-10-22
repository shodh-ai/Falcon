import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TranscriptsPage from '@/app/(portals)/exam-cell/transcripts/page';

const { api, auth, toast, fetchPdf, createObjectUrl, revokeObjectUrl } = vi.hoisted(() => {
  const api = { get: vi.fn(), post: vi.fn() };
  return { api, auth: { api, token: 'synthetic-token', user: { roles: ['ExamCell'] as string[], primaryRole: '', role: '' } },
    toast: { success: vi.fn(), error: vi.fn() }, fetchPdf: vi.fn(), createObjectUrl: vi.fn(), revokeObjectUrl: vi.fn() };
});
vi.mock('@/lib/api', () => ({ useAuthedApi: () => auth.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/api/client', () => ({ getApiBaseUrl: () => 'http://127.0.0.1:4400', authHeaders: () => ({ Authorization: 'Bearer synthetic-token', 'x-tenant-subdomain': 'synthetic' }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));

const transcript = (name = 'Synthetic archived student', semester = 4) => ({ transcript_id: name, student_user_id: name, student_name: name, enrollment_no: 'SYNTH-TRANSCRIPT', semester,
  status: 'ARCHIVED', pdf_url: '/uploads/synthetic/transcript.pdf', verification_code: 'SYNTHETIC', generated_at: '2026-10-21T09:00:00Z' });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  vi.clearAllMocks(); api.get.mockReset().mockResolvedValue([]); api.post.mockReset(); auth.api = api;
  auth.user = { roles: ['ExamCell'], primaryRole: '', role: '' };
  vi.stubGlobal('fetch', fetchPdf);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
  createObjectUrl.mockReturnValue('blob:synthetic-transcript');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Staff transcript controls', () => {
  it('loads actual archived transcripts and handles the batch response object without pretending it is a list', async () => {
    api.get.mockResolvedValueOnce([]).mockResolvedValueOnce([transcript()]);
    api.post.mockResolvedValue({ semester: 4, requested: 1, transcript_ids: ['synthetic-transcript'] });
    render(<TranscriptsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Generate transcripts' }));
    await screen.findByText('Synthetic archived student');
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/exam-cell/transcripts/generate', { semester: 4 });
    expect(api.get).toHaveBeenLastCalledWith('/api/exam-cell/transcripts?semester=4');
    expect(toast.success).toHaveBeenCalledWith('1 transcript generated');
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByText(/Phase 2/)).toBeNull();
  });

  it('distinguishes a failed transcript list from a genuinely empty semester and retries', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic transcript list unavailable')).mockResolvedValueOnce([]);
    render(<TranscriptsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic transcript list unavailable');
    expect(screen.queryByText('No official transcripts for this semester.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Generate transcripts' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry transcripts' }));
    expect(await screen.findByText('No official transcripts for this semester.')).toBeTruthy();
  });

  it('ignores a superseded semester response', async () => {
    const old = deferred<ReturnType<typeof transcript>[]>();
    api.get.mockImplementation((path: string) => path.includes('semester=4') ? old.promise : Promise.resolve([transcript('Current semester student', 5)]));
    render(<TranscriptsPage />);
    fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '5' } });
    await screen.findByText('Current semester student');
    await act(async () => old.resolve([transcript('Stale semester student')]));
    expect(screen.queryByText('Stale semester student')).toBeNull();
  });

  it('hides records immediately when the authenticated API changes', async () => {
    api.get.mockResolvedValue([transcript()]);
    const { rerender } = render(<TranscriptsPage />);
    await screen.findByText('Synthetic archived student');
    const pending = deferred<ReturnType<typeof transcript>[]>();
    auth.api = { get: vi.fn().mockReturnValue(pending.promise), post: vi.fn() };
    rerender(<TranscriptsPage />);
    expect(screen.queryByText('Synthetic archived student')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading transcripts');
    await act(async () => pending.resolve([]));
  });

  it('prevents duplicate generation and locks the semester and downloads during the write', async () => {
    api.get.mockResolvedValue([transcript()]); const pending = deferred<object>(); api.post.mockReturnValue(pending.promise);
    render(<TranscriptsPage />); await screen.findByText('Synthetic archived student');
    const generate = screen.getByRole('button', { name: 'Generate transcripts' });
    act(() => { fireEvent.click(generate); fireEvent.click(generate); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Semester')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download transcript PDF for Synthetic archived student' })).toBeDisabled();
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ semester: 4, requested: 0, transcript_ids: [] }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('No new transcripts were needed'));
  });

  it('keeps read-only staff from transcript generation', async () => {
    auth.user = { roles: ['ExamOperator'], primaryRole: '', role: '' }; api.get.mockResolvedValue([transcript()]);
    render(<TranscriptsPage />); await screen.findByText('Synthetic archived student');
    expect(screen.queryByRole('button', { name: 'Generate transcripts' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download transcript PDF for Synthetic archived student' })).toBeEnabled();
  });

  it('downloads the existing stored PDF with tenant authorization and validates the response', async () => {
    api.get.mockResolvedValue([transcript()]);
    fetchPdf.mockResolvedValue({ ok: true, blob: async () => new Blob(['%PDF-synthetic'], { type: 'application/pdf' }) });
    render(<TranscriptsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download transcript PDF for Synthetic archived student' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Transcript PDF downloaded'));
    expect(fetchPdf).toHaveBeenCalledWith('http://127.0.0.1:4400/api/uploads/download?path=%2Fuploads%2Fsynthetic%2Ftranscript.pdf', { headers: { Authorization: 'Bearer synthetic-token', 'x-tenant-subdomain': 'synthetic' }, cache: 'no-store' });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:synthetic-transcript');
  });

  it('does not fabricate a PDF or claim success after a denied download', async () => {
    api.get.mockResolvedValue([transcript()]); fetchPdf.mockResolvedValue({ ok: false, status: 403 });
    render(<TranscriptsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download transcript PDF for Synthetic archived student' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not download transcript (HTTP 403).'));
    expect(toast.success).not.toHaveBeenCalled(); expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('rejects malformed list responses and invalid semesters without permitting generation', async () => {
    api.get.mockResolvedValue({ transcripts: [] });
    render(<TranscriptsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The server did not return a transcript list.');
    fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '0' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid semester');
    expect(screen.getByRole('button', { name: 'Generate transcripts' })).toBeDisabled();
    expect(api.get).toHaveBeenCalledTimes(1); expect(api.post).not.toHaveBeenCalled();
  });

  it('reloads actual saved records after a failed batch without claiming success', async () => {
    api.get.mockResolvedValueOnce([]).mockResolvedValueOnce([transcript('Stored before batch failure')]);
    api.post.mockRejectedValue(new Error('Synthetic PDF storage unavailable'));
    render(<TranscriptsPage />); await screen.findByText('No official transcripts for this semester.');
    fireEvent.click(screen.getByRole('button', { name: 'Generate transcripts' }));
    await screen.findByText('Stored before batch failure');
    expect(toast.error).toHaveBeenCalledWith('Synthetic PDF storage unavailable');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not call an unexpected batch response a successful generation', async () => {
    api.post.mockResolvedValue([]);
    render(<TranscriptsPage />); await screen.findByText('No official transcripts for this semester.');
    fireEvent.click(screen.getByRole('button', { name: 'Generate transcripts' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('unexpected response')));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not download an old-session response after authentication changes', async () => {
    api.get.mockResolvedValue([transcript()]); const pending = deferred<object>(); fetchPdf.mockReturnValue(pending.promise);
    const { rerender } = render(<TranscriptsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download transcript PDF for Synthetic archived student' }));
    auth.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn() };
    rerender(<TranscriptsPage />); await screen.findByText('No official transcripts for this semester.');
    await act(async () => pending.resolve({ ok: true, blob: async () => new Blob(['%PDF-synthetic'], { type: 'application/pdf' }) }));
    expect(createObjectUrl).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
  });

  it('requires a reissue reason and prevents duplicate issuance while preserving the previous history', async () => {
    const old = { ...transcript(), status: 'REVOKED', pdf_url: null, downloadable: false, needs_reissue: true, revision: 1, revocation_reason: 'Published result changed' };
    const current = { ...transcript('New transcript revision'), revision: 2, downloadable: true };
    api.get.mockResolvedValueOnce([old]).mockResolvedValueOnce([old, current]);
    const pending = deferred<object>(); api.post.mockReturnValue(pending.promise);
    render(<TranscriptsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reissue transcript for Synthetic archived student' }));
    const issue = screen.getByRole('button', { name: 'Issue new revision' });
    expect(issue).toBeDisabled();
    expect(screen.getByLabelText('Reason for reissue')).toHaveAttribute('maxlength', '500');
    fireEvent.change(screen.getByLabelText('Reason for reissue'), { target: { value: 'Published revaluation revised marks' } });
    act(() => { fireEvent.click(issue); fireEvent.click(issue); });
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/exam-cell/transcripts/Synthetic archived student/reissue', { reason: 'Published revaluation revised marks' });
    await act(async () => pending.resolve({ transcript_id: 'new', status: 'ARCHIVED', reissued: true }));
    await screen.findByText('New transcript revision');
    expect(screen.getByText('Published result changed')).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith('New transcript revision issued; the previous copy is invalid');
  });

  it('does not expose reissue controls to read-only staff', async () => {
    auth.user = { roles: ['ExamOperator'], primaryRole: '', role: '' };
    api.get.mockResolvedValue([{ ...transcript(), status: 'REVOKED', needs_reissue: true, downloadable: false }]);
    render(<TranscriptsPage />); await screen.findByText('Synthetic archived student');
    expect(screen.queryByRole('button', { name: /Reissue transcript/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Download transcript PDF/ })).toBeNull();
  });

  it('does not claim reissue success when eligibility or storage rejects it', async () => {
    api.get.mockResolvedValue([{ ...transcript(), status: 'REVOKED', needs_reissue: true, downloadable: false }]);
    api.post.mockRejectedValue(new Error('Transcript is blocked by an open UFM case'));
    render(<TranscriptsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reissue transcript for Synthetic archived student' }));
    fireEvent.change(screen.getByLabelText('Reason for reissue'), { target: { value: 'Updated result' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue new revision' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Transcript is blocked by an open UFM case'));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
