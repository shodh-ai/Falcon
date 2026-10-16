import { Blob as NodeBlob } from 'node:buffer';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentAdmissionVaultPage from '@/app/(portals)/student/admission-vault/page';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), getBlob: vi.fn(), post: vi.fn() },
  token: 'student-a-token',
  userId: 'student-a',
  demoMode: false,
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
  pdfPreview: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    token: mocks.token,
    user: { user_id: mocks.userId, tenant_id: 'synthetic-tenant', name: 'Student A', role: 'Student' },
  }),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/lib/student-demo-mode', () => ({ isStudentDemoModeEnabled: () => mocks.demoMode }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/components/student/StudentDocumentPdfPreview', () => ({
  StudentDocumentPdfPreview: (props: { blob: Blob; title: string }) => {
    mocks.pdfPreview(props);
    return <div data-testid="document-pdf-preview" aria-label={props.title} />;
  },
}));

function certificate(overrides: Record<string, unknown> = {}) {
  return {
    certificate_id: 'certificate-a',
    title: 'Synthetic school certificate',
    issuer: 'Fictional Test School',
    verification_status: 'PENDING',
    file_path: 'student-a/certificate.pdf',
    uploaded_at: '2026-10-15T06:00:00Z',
    ...overrides,
  };
}

function vault(documents: Record<string, unknown>[] = [certificate()]) {
  return {
    profile: { admission_type: 'REGULAR', admission_number: 'TEST-2026-A', migration_certificate_status: 'REQUIRED' },
    application: null,
    entrance_exams: [],
    counseling_rounds: [],
    documents,
    admission_fee_receipts: [],
    timeline: [],
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Synthetic tuition receipt',
    file_url: '/api/uploads/download?path=student-a%2Freceipt.pdf',
    created_at: '2026-10-15T07:00:00Z',
    category: 'FEE_RECEIPTS',
    ...overrides,
  };
}

function mockData(documents = [certificate()], receipts = [receipt()]) {
  mocks.api.get.mockImplementation((path: string) => {
    if (path === '/api/student/admission-vault') return Promise.resolve(vault(documents));
    if (path === '/api/student/documents') return Promise.resolve({ documents: receipts });
    return Promise.reject(new Error(`Unexpected test request: ${path}`));
  });
}

function pdfBlob() {
  return new NodeBlob(['%PDF-1.4\nSynthetic private document\n%%EOF'], { type: 'application/pdf' }) as unknown as Blob;
}

async function viewRow(title = 'Synthetic school certificate') {
  const row = (await screen.findByText(title, { exact: true })).closest('li');
  if (!row) throw new Error('Document row is missing');
  fireEvent.click(within(row).getByRole('button', { name: 'View', exact: true }));
  return screen.getByRole('dialog', { name: title });
}

function closeDialog(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close', exact: true })[0]);
}

async function chooseUpload(file = new File(['%PDF-1.4\nUploaded test document'], 'uploaded.pdf', { type: 'application/pdf' })) {
  fireEvent.click(await screen.findByRole('button', { name: 'Upload', exact: true }));
  const dialog = screen.getByRole('dialog', { name: 'Upload admission document' });
  fireEvent.change(within(dialog).getByLabelText('Upload', { selector: 'input' }), { target: { files: [file] } });
  return { dialog, file };
}

beforeEach(() => {
  mocks.token = 'student-a-token';
  mocks.userId = 'student-a';
  mocks.demoMode = false;
  mocks.api.get.mockReset();
  mocks.api.getBlob.mockReset().mockResolvedValue(pdfBlob());
  mocks.api.post.mockReset();
  mocks.success.mockReset();
  mocks.error.mockReset();
  mocks.createObjectURL.mockReset().mockReturnValue('blob:private-vault-file');
  mocks.revokeObjectURL.mockReset();
  mocks.pdfPreview.mockReset();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = mocks.createObjectURL;
    static revokeObjectURL = mocks.revokeObjectURL;
  });
  mockData();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Student document vault previews', () => {
  it('removes the Migration certificate summary card while preserving the upload option', async () => {
    render(<StudentAdmissionVaultPage />);
    expect(await screen.findByText('TEST-2026-A')).toBeInTheDocument();
    expect(screen.queryByText('Migration certificate', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('REQUIRED', { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload', exact: true }));
    expect(screen.getByRole('option', { name: 'Migration Certificate' })).toBeInTheDocument();
  });

  it('loads the saved certificate through authenticated getBlob before displaying a PDF', async () => {
    const originalBlob = pdfBlob();
    mocks.api.getBlob.mockResolvedValue(originalBlob);
    render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow();
    const link = await within(dialog).findByRole('link', { name: /Open.*new tab/i });
    expect(mocks.api.getBlob).toHaveBeenCalledWith('/api/uploads/download?path=student-a%2Fcertificate.pdf');
    expect(link).toHaveAttribute('href', 'blob:private-vault-file');
    expect(link).toHaveAttribute('target', '_blank');
    expect(within(dialog).getByTestId('document-pdf-preview')).toHaveAttribute('aria-label', 'Synthetic school certificate');
    const previewProps = mocks.pdfPreview.mock.lastCall?.[0] as { blob: Blob; title: string };
    expect(previewProps.blob).toBe(originalBlob);
    expect(previewProps.title).toBe('Synthetic school certificate');
    expect(dialog.innerHTML).not.toContain('student-a-token');
    expect(within(dialog).getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
  });

  it('uses the same authenticated file workflow for fee receipts', async () => {
    const originalBlob = pdfBlob();
    mocks.api.getBlob.mockResolvedValue(originalBlob);
    render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow('Synthetic tuition receipt');
    await within(dialog).findByRole('link', { name: /Open.*new tab/i });
    expect(mocks.api.getBlob).toHaveBeenCalledWith('/api/uploads/download?path=student-a%2Freceipt.pdf');
    expect(within(dialog).getByTestId('document-pdf-preview')).toHaveAttribute('aria-label', 'Synthetic tuition receipt');
    expect(mocks.pdfPreview.mock.lastCall?.[0].blob).toBe(originalBlob);
    expect(within(dialog).getByText('Fee payment receipt', { exact: true })).toBeInTheDocument();
  });

  it('normalizes legacy receipt download links without forwarding a stored access token', async () => {
    mockData([certificate()], [receipt({ file_url: '/uploads/download?path=student-a%2Freceipt.pdf&access_token=old-secret' })]);
    render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow('Synthetic tuition receipt');
    await within(dialog).findByRole('link', { name: /Open.*new tab/i });
    expect(mocks.api.getBlob).toHaveBeenCalledWith('/api/uploads/download?path=student-a%2Freceipt.pdf');
    expect(dialog.innerHTML).not.toContain('old-secret');
  });

  it('does not send authentication to an external receipt URL', async () => {
    mockData([certificate()], [receipt({ file_url: 'https://untrusted.example/receipt.pdf' })]);
    render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow('Synthetic tuition receipt');
    await within(dialog).findByRole('alert');
    expect(mocks.api.getBlob).not.toHaveBeenCalled();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(dialog.querySelector('iframe, object, [data-testid="document-pdf-preview"]')).toBeNull();
    expect(within(dialog).queryByRole('link', { name: /Open.*new tab/i })).toBeNull();
  });

  it('previews an actual image as an image instead of forcing it into a PDF viewer', async () => {
    mockData([certificate({ file_path: 'student-a/certificate.png' })]);
    mocks.api.getBlob.mockResolvedValue(new NodeBlob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }));
    render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow();
    expect(await within(dialog).findByRole('img', { name: 'Synthetic school certificate' })).toHaveAttribute('src', 'blob:private-vault-file');
    expect(dialog.querySelector('iframe, object, [data-testid="document-pdf-preview"]')).toBeNull();
  });

  it.each(['certificate', 'receipt'])('does not fabricate a %s PDF when no file is attached', async (kind) => {
    mockData([certificate({ file_path: null })], [receipt({ file_url: '#' })]);
    render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow(kind === 'receipt' ? 'Synthetic tuition receipt' : 'Synthetic school certificate');
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(mocks.api.getBlob).not.toHaveBeenCalled();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(dialog.querySelector('iframe, object, [data-testid="document-pdf-preview"]')).toBeNull();
    expect(within(dialog).queryByRole('link', { name: /Open.*new tab/i })).toBeNull();
    const download = within(dialog).queryByRole('button', { name: 'Download', exact: true });
    if (download) expect(download).toBeDisabled();
    expect(within(dialog).queryByText(/system copy/i)).toBeNull();
  });

  it('shows a safe retryable error for a missing stored file instead of embedding the server error', async () => {
    mocks.api.getBlob.mockRejectedValueOnce(new Error('Internal storage bucket secret: file not found'));
    render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow();
    expect(await within(dialog).findByRole('alert')).not.toHaveTextContent('Internal storage bucket secret');
    expect(dialog.querySelector('iframe, object, [data-testid="document-pdf-preview"]')).toBeNull();
    expect(within(dialog).queryByRole('link', { name: /Open.*new tab/i })).toBeNull();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: /Retry/i }));
    expect(await within(dialog).findByRole('link', { name: /Open.*new tab/i })).toHaveAttribute('href', 'blob:private-vault-file');
    expect(mocks.api.getBlob).toHaveBeenCalledTimes(2);
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it.each(['text/html', 'application/json'])('never embeds a %s error page returned by the file endpoint', async (type) => {
    mocks.api.getBlob.mockResolvedValue(new NodeBlob(['Server error'], { type }));
    render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow();
    await within(dialog).findByRole('alert');
    expect(dialog.querySelector('iframe, object, [data-testid="document-pdf-preview"]')).toBeNull();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
  });

  it('keeps downloading disabled until the authenticated file has arrived', async () => {
    mocks.api.getBlob.mockReturnValue(new Promise(() => {}));
    render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow();
    const download = within(dialog).queryByRole('button', { name: 'Download', exact: true });
    if (download) expect(download).toBeDisabled();
    expect(within(dialog).queryByRole('link', { name: /Open.*new tab/i })).toBeNull();
    expect(dialog.querySelector('iframe, object, [data-testid="document-pdf-preview"]')).toBeNull();
  });

  it('downloads the already verified blob without sending a token-bearing URL to the browser', async () => {
    const downloadClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow();
    await within(dialog).findByRole('link', { name: /Open.*new tab/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download', exact: true }));
    await waitFor(() => expect(downloadClick).toHaveBeenCalledTimes(1));
    const anchor = downloadClick.mock.instances[0];
    expect(anchor).toHaveAttribute('href', 'blob:private-vault-file');
    expect(anchor).toHaveAttribute('download', expect.stringMatching(/\.pdf$/));
    expect(mocks.api.getBlob).toHaveBeenCalledTimes(1);
  });

  it('releases the private blob when the preview is closed', async () => {
    render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow();
    await within(dialog).findByRole('link', { name: /Open.*new tab/i });
    closeDialog(dialog);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:private-vault-file');
  });

  it('releases the private blob when leaving the page', async () => {
    const { unmount } = render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow();
    await within(dialog).findByRole('link', { name: /Open.*new tab/i });
    unmount();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:private-vault-file');
  });

  it('ignores a file response that finishes after the user closes its preview', async () => {
    let resolveFile!: (blob: Blob) => void;
    mocks.api.getBlob.mockReturnValueOnce(new Promise<Blob>((resolve) => { resolveFile = resolve; }));
    render(<StudentAdmissionVaultPage />);
    closeDialog(await viewRow());
    await act(async () => { resolveFile(pdfBlob()); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('iframe, object, [data-testid="document-pdf-preview"]')).toBeNull();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
  });

  it('clears a loaded private preview and previous document list when the signed-in account changes', async () => {
    const { rerender } = render(<StudentAdmissionVaultPage />);
    const dialog = await viewRow();
    await within(dialog).findByRole('link', { name: /Open.*new tab/i });
    mocks.api.get.mockReturnValue(new Promise(() => {}));
    mocks.token = 'student-b-token';
    mocks.userId = 'student-b';
    rerender(<StudentAdmissionVaultPage />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Synthetic school certificate')).toBeNull();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:private-vault-file');
  });

  it('ignores the previous student file response after an account switch', async () => {
    let resolveFile!: (blob: Blob) => void;
    mocks.api.getBlob.mockReturnValueOnce(new Promise<Blob>((resolve) => { resolveFile = resolve; }));
    const { rerender } = render(<StudentAdmissionVaultPage />);
    await viewRow();
    mocks.api.get.mockReturnValue(new Promise(() => {}));
    mocks.token = 'student-b-token';
    mocks.userId = 'student-b';
    rerender(<StudentAdmissionVaultPage />);
    await act(async () => { resolveFile(pdfBlob()); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('iframe, object, [data-testid="document-pdf-preview"]')).toBeNull();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
  });
});

describe('Student admission document upload', () => {
  it('adds the server-confirmed uploaded certificate with a working View action', async () => {
    mocks.api.post.mockResolvedValue({ certificate: certificate({
      certificate_id: 'new-certificate', title: '10th Marksheet', file_path: 'student-a/uploaded.pdf',
    }) });
    render(<StudentAdmissionVaultPage />);
    const { dialog, file } = await chooseUpload();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Upload for verification' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Upload admission document' })).toBeNull());
    const [path, form] = mocks.api.post.mock.calls[0] as [string, FormData];
    expect(path).toBe('/api/student/admission-documents');
    expect(form.get('title')).toBe('10th Marksheet');
    expect(form.get('file')).toBe(file);
    const preview = await viewRow('10th Marksheet');
    await within(preview).findByRole('link', { name: /Open.*new tab/i });
    expect(mocks.api.getBlob).toHaveBeenCalledWith('/api/uploads/download?path=student-a%2Fuploaded.pdf');
  });

  it('keeps a failed upload editable and never invents a successful document, including in demo mode', async () => {
    mocks.demoMode = true;
    mocks.api.post.mockRejectedValue(new Error('Upload service unavailable'));
    render(<StudentAdmissionVaultPage />);
    const { dialog } = await chooseUpload();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Upload for verification' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Upload for verification' })).toBeEnabled();
    expect(mocks.success).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('10th Marksheet', { exact: true })).toBeNull();
  });
});
