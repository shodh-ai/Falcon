import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentTranscriptsPage from '@/app/(portals)/student/transcripts/page';

const { api, auth, toast, fetchPdf, createObjectUrl, revokeObjectUrl } = vi.hoisted(() => {
  const api = { get: vi.fn() };
  return { api, auth: { api },
  toast: { success: vi.fn(), error: vi.fn() },
  fetchPdf: vi.fn(), createObjectUrl: vi.fn(), revokeObjectUrl: vi.fn(),
}; });
vi.mock('@/lib/api', () => ({ useAuthedApi: () => auth.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'synthetic-token' }) }));
vi.mock('@/lib/api/client', () => ({
  getApiBaseUrl: () => 'http://127.0.0.1:4400',
  authHeaders: (token: string) => ({ Authorization: `Bearer ${token}`, 'x-tenant-subdomain': 'synthetic' }),
}));
vi.mock('@/lib/student-demo-mode', () => ({ isStudentDemoModeEnabled: () => false }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));

const transcript = { transcript_id: 'synthetic-transcript', semester: 6, status: 'ARCHIVED', pdf_url: '/uploads/synthetic/transcript.pdf' };

beforeEach(() => {
  vi.clearAllMocks();
  auth.api = api;
  api.get.mockResolvedValue([transcript]);
  vi.stubGlobal('fetch', fetchPdf);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
  createObjectUrl.mockReturnValue('blob:synthetic-transcript');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Official student transcript download', () => {
  it('shows a failed transcript request separately from an empty list and retries', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic transcript service unavailable')).mockResolvedValueOnce([]);
    render(<StudentTranscriptsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic transcript service unavailable');
    expect(screen.queryByText('No official transcripts yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry transcripts' }));
    expect(await screen.findByText('No official transcripts yet')).toBeTruthy();
  });

  it('hides old-session documents and ignores a stale response after authentication changes', async () => {
    let resolveOld!: (rows: object[]) => void;
    api.get.mockReturnValue(new Promise((resolve) => { resolveOld = resolve; }));
    const { rerender } = render(<StudentTranscriptsPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    auth.api = { get: vi.fn().mockResolvedValue([]) };
    rerender(<StudentTranscriptsPage />);
    await screen.findByText('No official transcripts yet');
    await act(async () => resolveOld([transcript]));
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('does not download a pending response after authentication changes', async () => {
    let resolve!: (response: object) => void;
    fetchPdf.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { rerender } = render(<StudentTranscriptsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    auth.api = { get: vi.fn().mockResolvedValue([]) };
    rerender(<StudentTranscriptsPage />); await screen.findByText('No official transcripts yet');
    await act(async () => resolve({ ok: true, blob: async () => new Blob(['%PDF-synthetic'], { type: 'application/pdf' }) }));
    expect(createObjectUrl).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
  });

  it('rejects malformed transcript-list data instead of presenting it as an empty list', async () => {
    api.get.mockResolvedValue({ transcripts: [] }); render(<StudentTranscriptsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The server did not return a transcript list.');
    expect(screen.queryByText('No official transcripts yet')).toBeNull();
  });

  it('downloads the stored PDF with authorization and only reports success after the API returns it', async () => {
    let resolve!: (response: object) => void;
    fetchPdf.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<StudentTranscriptsPage />);
    const button = await screen.findByRole('button', { name: 'Download' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchPdf).toHaveBeenCalledTimes(1);
    expect(fetchPdf).toHaveBeenCalledWith(
      'http://127.0.0.1:4400/api/uploads/download?path=%2Fuploads%2Fsynthetic%2Ftranscript.pdf',
      { headers: { Authorization: 'Bearer synthetic-token', 'x-tenant-subdomain': 'synthetic' }, cache: 'no-store' },
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    await act(async () => { resolve({ ok: true, blob: async () => new Blob(['%PDF-synthetic'], { type: 'application/pdf' }) }); });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Transcript PDF downloaded'));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:synthetic-transcript');
  });

  it('reports a failed protected download without generating a substitute PDF or claiming success', async () => {
    fetchPdf.mockResolvedValue({ ok: false, status: 403 });
    render(<StudentTranscriptsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not download transcript (HTTP 403).'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
  });

  it('does not fabricate an official PDF when issuance has no stored file', async () => {
    api.get.mockResolvedValue([{ ...transcript, pdf_url: null, status: 'REQUESTED' }]);
    render(<StudentTranscriptsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The official transcript PDF has not been issued yet.'));
    expect(fetchPdf).not.toHaveBeenCalled();
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('refuses an external official-document link that would bypass revision authorization', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    api.get.mockResolvedValue([{ ...transcript, pdf_url: 'https://documents.example/transcript.pdf' }]);
    render(<StudentTranscriptsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Official transcripts require protected storage. Contact the Examination Cell.'));
    expect(open).not.toHaveBeenCalled();
    expect(fetchPdf).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows revoked history without allowing its previous stored file to download', async () => {
    api.get.mockResolvedValue([{ ...transcript, status: 'REVOKED', revision: 1, downloadable: false, revocation_reason: 'Published revaluation changed results' }]);
    render(<StudentTranscriptsPage />);
    expect(await screen.findByText('Published revaluation changed results')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
    expect(fetchPdf).not.toHaveBeenCalled();
  });
});
