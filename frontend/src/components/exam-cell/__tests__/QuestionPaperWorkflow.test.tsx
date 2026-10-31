import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '@/app/(portals)/exam-cell/question-papers/page';

const mock = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), getBlob: vi.fn() }, role: 'ExamCell', success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mock.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { primaryRole: mock.role, role: mock.role, roles: [mock.role] } }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mock.success, error: mock.error } }));
vi.mock('@/components/ui/select', () => ({ Select: ({ children, ...props }: ComponentProps<'select'>) => <select {...props}>{children}</select> }));
const base = '/api/exam-cell/question-papers';
let paper: { qp_id: string; subject_name: string; subject_code: string; exam_date: string; exam_type: string; status: string; notes: null; version_number: number | null; has_file: boolean };
let versions: Array<{ version_id: string; version_number: number; uploaded_at: string; document_bytes: number; reason: null }>;
beforeEach(() => {
  vi.resetAllMocks(); mock.role = 'ExamCell';
  paper = { qp_id: 'paper-a', subject_name: 'Verified Subject', subject_code: 'SUB1', exam_date: '2026-11-01', exam_type: 'END_TERM', status: 'UPLOADED', notes: null, version_number: null, has_file: false }; versions = [];
  mock.api.get.mockImplementation(async (path: string) => path === base ? [{ ...paper }] : path.endsWith('/versions') ? [...versions] : [{ exam_schedule_id: 'schedule-a', subject_name: 'Verified Subject', exam_date: '2026-11-01', exam_type: 'END_TERM' }]);
  mock.api.post.mockImplementation(async (path: string, body: { status?: string } | FormData) => {
    if (path.endsWith('/file')) { paper.has_file = true; paper.version_number = 1; paper.status = 'UPLOADED'; versions = [{ version_id: 'version-a', version_number: 1, uploaded_at: '2026-10-24T09:00:00Z', document_bytes: 123, reason: null }]; }
    else if (path.endsWith('/status')) paper.status = (body as { status: string }).status;
    return { qp_id: 'paper-a' };
  });
  mock.api.getBlob.mockResolvedValue(new Blob(['stored PDF'], { type: 'application/pdf' }));
  URL.createObjectURL = vi.fn(() => 'blob:private-review'); URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
async function open() { render(<Page />); await screen.findByText('Verified Subject'); fireEvent.click(screen.getByRole('button', { name: 'Manage files' })); await screen.findByText('Retained versions'); }
function chooseFile() { fireEvent.change(screen.getByLabelText('PDF paper (maximum 25 MB)'), { target: { files: [new File(['%PDF-fixture'], 'paper.pdf', { type: 'application/pdf' })] } }); }

describe('existing question-paper page is connected to secure file and stage APIs', () => {
  it('keeps a metadata-only paper out of moderation and printing', async () => {
    render(<Page />); await screen.findByText('Awaiting PDF upload');
    expect(screen.getByRole('button', { name: 'Send to moderation' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Download for printing' })).not.toBeInTheDocument();
  });
  it('registers the explicit examination and derives the subject from that schedule', async () => {
    render(<Page />); await screen.findByRole('option', { name: /Verified Subject/ });
    expect(screen.getByRole('button', { name: 'Add record' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Examination schedule'), { target: { value: 'schedule-a' } });
    expect(screen.getByLabelText('Subject from examination')).toHaveValue('Verified Subject');
    fireEvent.click(screen.getByRole('button', { name: 'Add record' }));
    await waitFor(() => expect(mock.api.post).toHaveBeenCalledWith(base, { exam_schedule_id: 'schedule-a', notes: undefined }));
  });
  it('uploads real FormData then follows moderation, approval, print authorization and the protected download', async () => {
    await open(); chooseFile(); fireEvent.click(screen.getByRole('button', { name: 'Upload PDF version' }));
    await screen.findByText('Version 1');
    const call = mock.api.post.mock.calls.find(c => c[0] === base + '/paper-a/file');
    expect(call?.[1]).toBeInstanceOf(FormData); expect((call?.[1] as FormData).get('file')).toBeInstanceOf(File);
    fireEvent.click(screen.getByRole('button', { name: 'Send to moderation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve moderated paper' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Authorize printing' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Download for printing' }));
    await waitFor(() => expect(mock.api.getBlob).toHaveBeenCalledWith(base + '/paper-a/file'));
    const transitions = mock.api.post.mock.calls.filter(c => (c[0] as string).endsWith('/status')).map(c => c[1]);
    expect(transitions).toEqual([{ status: 'UNDER_MODERATION' }, { status: 'COE_APPROVED' }, { status: 'PRINT_AUTHORIZED' }]);
  });
  it('uses the authenticated historical review endpoint instead of a public object link', async () => {
    paper.has_file = true; paper.version_number = 1; versions = [{ version_id: 'version-a', version_number: 1, uploaded_at: '2026-10-24T09:00:00Z', document_bytes: 123, reason: null }];
    await open(); fireEvent.click(screen.getByRole('button', { name: 'Download review copy v1' }));
    await waitFor(() => expect(mock.api.getBlob).toHaveBeenCalledWith(base + '/paper-a/versions/version-a/review-file'));
  });
  it('requires reasons for rejection and replacement and never advances a rejected status directly', async () => {
    paper.status = 'REJECTED'; paper.has_file = true; paper.version_number = 1; versions = [{ version_id: 'version-a', version_number: 1, uploaded_at: '2026-10-24T09:00:00Z', document_bytes: 123, reason: null }];
    await open(); expect(screen.queryByRole('button', { name: 'Send to moderation' })).not.toBeInTheDocument();
    chooseFile(); fireEvent.click(screen.getByRole('button', { name: 'Upload PDF version' }));
    expect(mock.api.post).not.toHaveBeenCalled(); expect(mock.error).toHaveBeenCalledWith('Explain why a new version is required');
    fireEvent.change(screen.getByLabelText('Rejection / new version reason'), { target: { value: 'Corrected question two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload PDF version' }));
    await waitFor(() => expect(mock.api.post).toHaveBeenCalledWith(base + '/paper-a/file', expect.any(FormData)));
  });
  it('keeps paper operations unavailable to an operator without a managing role', async () => {
    mock.role = 'ExamOperator'; render(<Page />); await screen.findByText('Verified Subject');
    expect(screen.getByText('Metadata only')).toBeVisible(); expect(screen.queryByRole('button', { name: 'Add record' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Manage files' })).not.toBeInTheDocument();
  });
  it('does not claim successful approval when the backend rejects a skipped or stale transition', async () => {
    paper.has_file = true; paper.version_number = 1; mock.api.post.mockRejectedValue(new Error('Cannot move question paper'));
    render(<Page />); fireEvent.click(await screen.findByRole('button', { name: 'Send to moderation' }));
    await waitFor(() => expect(mock.error).toHaveBeenCalledWith('Cannot move question paper')); expect(mock.success).not.toHaveBeenCalled();
  });
  it('shows backend failure instead of a false empty register and supports retry', async () => {
    mock.api.get.mockRejectedValueOnce(new Error('Private paper register unavailable'));
    render(<Page />); expect(await screen.findByRole('alert')).toHaveTextContent('Private paper register unavailable'); expect(screen.queryByText('No question papers registered for your tenant.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading papers' })); expect(await screen.findByText('Verified Subject')).toBeVisible();
  });
});
