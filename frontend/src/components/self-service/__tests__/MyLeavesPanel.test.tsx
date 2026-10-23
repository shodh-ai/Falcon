import type { SelectHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyLeavesPanel } from '../MyLeavesPanel';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  auth: { user: { user_id: 'faculty-1' } as { user_id: string } | null, token: 'token-1' as string | null },
  toast: { success: vi.fn(), error: vi.fn() },
  fetch: vi.fn(),
}));
const balance = { leave_type: 'CL', entitled: 12, used: 2 };
const request = { leave_id: 'leave-1', leave_type: 'CL', request_type: 'LEAVE', start_date: '2026-11-20', end_date: '2026-11-21', status: 'PENDING', reason: 'Family appointment' };
vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => fixtures.auth }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/lib/api-base-url', () => ({ getApiBaseUrl: () => 'http://runtime-api.test' }));
vi.mock('@/lib/tenant', () => ({ getSubdomainFromClient: () => 'test' }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/components/faculty/ProxyTeachingDialog', () => ({ ProxyTeachingDialog: () => <p>Proxy teaching options</p> }));
vi.mock('@/lib/faculty-demo-mode', () => ({ withFacultyDemoFallback: (live: unknown) => live, isEmptyArray: (rows: unknown[]) => !rows.length }));

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn().mockResolvedValue(request) };
  fixtures.auth = { user: { user_id: 'faculty-1' }, token: 'token-1' };
  fixtures.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: '/uploads/test/proof.pdf', path: 'C:\\private\\proof.pdf' }) });
  vi.stubGlobal('fetch', fixtures.fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const reason = () => screen.getByRole('textbox', { name: 'Reason' });
const submit = () => screen.getByRole('button', { name: 'Submit leave' });
const draftForm = () => reason().closest('form')!;
function fillDraft(value = '  Family appointment  ') {
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-20' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-21' } });
  fireEvent.change(reason(), { target: { value } });
}
function attach() {
  const file = new File(['proof'], 'proof.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Supporting document (optional)'), { target: { files: [file] } });
  return file;
}
async function ready() { await screen.findByText('No leave requests yet.'); }

describe('leave and on-duty request integrity', () => {
  it('shows loading rather than empty until the requests read succeeds', async () => {
    let resolve!: (rows: typeof request[]) => void;
    fixtures.api.get.mockImplementation((path: string) => path.endsWith('my-balances') ? Promise.resolve([]) : new Promise<typeof request[]>((done) => { resolve = done; }));
    render(<MyLeavesPanel />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading leave information…');
    expect(screen.queryByText('No leave requests yet.')).not.toBeInTheDocument();
    await act(async () => { resolve([]); });
    expect(screen.getByText('No leave requests yet.')).toBeInTheDocument();
  });

  it('keeps successful balances and requests when the sibling read fails, and supports retry', async () => {
    fixtures.api.get.mockImplementation((path: string) => path.endsWith('my-balances') ? Promise.resolve([balance]) : Promise.reject(new Error('Requests offline')));
    render(<MyLeavesPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Leave requests: Requests offline');
    expect(screen.getByText('Used 2 of 12')).toBeInTheDocument();
    expect(screen.queryByText('No leave requests yet.')).not.toBeInTheDocument();
    fixtures.api.get.mockImplementation((path: string) => path.endsWith('my-balances') ? Promise.reject(new Error('Balances offline')) : Promise.resolve([request]));
    fireEvent.click(screen.getByRole('button', { name: 'Retry leave information' }));
    await screen.findByText('Family appointment');
    expect(screen.getByRole('alert')).toHaveTextContent('Leave balances: Balances offline');
    expect(screen.getByText('Used 2 of 12')).toBeInTheDocument();
    fixtures.api.get.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry leave information' }));
    await ready();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects a whitespace reason and missing or reversed dates without creating a request', async () => {
    render(<MyLeavesPanel />);
    await ready();
    fillDraft('   ');
    fireEvent.submit(draftForm());
    expect(fixtures.toast.error).toHaveBeenLastCalledWith('Enter a reason for your request');
    fillDraft();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } });
    fireEvent.submit(draftForm());
    expect(fixtures.toast.error).toHaveBeenLastCalledWith('Enter valid start and end dates');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-22' } });
    fireEvent.submit(draftForm());
    expect(fixtures.toast.error).toHaveBeenLastCalledWith('The end date cannot be before the start date');
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('guards duplicate submissions, trims the reason and locks all draft controls until save completes', async () => {
    let resolve!: (row: typeof request) => void;
    fixtures.api.post.mockReturnValue(new Promise<typeof request>((done) => { resolve = done; }));
    render(<MyLeavesPanel />);
    await ready();
    fillDraft();
    act(() => { fireEvent.submit(draftForm()); fireEvent.submit(draftForm()); });
    expect(fixtures.api.post).toHaveBeenCalledExactlyOnceWith('/api/hr/workforce/requests', expect.objectContaining({ request_type: 'LEAVE', leave_type: 'CL', reason: 'Family appointment', supporting_doc_urls: undefined }));
    expect(fixtures.fetch).not.toHaveBeenCalled();
    for (const label of ['Leave type', 'From', 'To', 'Reason', 'Supporting document (optional)']) expect(screen.getByLabelText(label)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Leave', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'On Duty (OD)' })).toBeDisabled();
    expect(submit()).toBeDisabled();
    await act(async () => { resolve(request); });
  });

  it('keeps the draft and proof after create fails and reuses the canonical uploaded URL on retry', async () => {
    fixtures.api.post.mockRejectedValueOnce(new Error('Create offline')).mockResolvedValueOnce(request);
    render(<MyLeavesPanel />);
    await ready();
    fillDraft();
    const file = attach();
    fireEvent.submit(draftForm());
    expect(await screen.findByRole('alert')).toHaveTextContent('Create offline');
    expect(reason()).toHaveValue('  Family appointment  ');
    expect((screen.getByLabelText('Supporting document (optional)') as HTMLInputElement).files?.[0]).toBe(file);
    expect(screen.getByLabelText('From')).toHaveValue('2026-11-20');
    fixtures.api.get.mockImplementation((path: string) => Promise.resolve(path.endsWith('my-balances') ? [] : [request]));
    fireEvent.submit(draftForm());
    await waitFor(() => expect(fixtures.toast.success).toHaveBeenCalledTimes(1));
    expect(fixtures.fetch).toHaveBeenCalledTimes(1);
    expect(fixtures.fetch).toHaveBeenCalledWith('http://runtime-api.test/uploads/single', expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer token-1', 'x-tenant-subdomain': 'test' }, body: expect.any(FormData) }));
    expect(fixtures.api.post).toHaveBeenLastCalledWith('/api/hr/workforce/requests', expect.objectContaining({ supporting_doc_urls: ['/uploads/test/proof.pdf'] }));
    expect(reason()).toHaveValue('');
  });

  it('does not submit a selected proof when upload returns no usable file pointer', async () => {
    fixtures.fetch.mockResolvedValue({ ok: true, json: async () => ({ path: ' ', url: '' }) });
    render(<MyLeavesPanel />);
    await ready();
    fillDraft();
    const file = attach();
    fireEvent.submit(draftForm());
    expect(await screen.findByRole('alert')).toHaveTextContent('Attachment upload returned no file location. Please retry.');
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(reason()).toHaveValue('  Family appointment  ');
    expect((screen.getByLabelText('Supporting document (optional)') as HTMLInputElement).files?.[0]).toBe(file);
    expect(submit()).toBeEnabled();
  });

  it('keeps a successful request visible after refresh fails and clears the submitted draft', async () => {
    fixtures.api.get.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockRejectedValue(new Error('Refresh offline'));
    render(<MyLeavesPanel />);
    await ready();
    fillDraft();
    fireEvent.submit(draftForm());
    expect(await screen.findByRole('alert')).toHaveTextContent('Request saved, but some leave information could not be refreshed.');
    expect(screen.getByText('Family appointment')).toBeInTheDocument();
    expect(screen.queryByText('No leave requests yet.')).not.toBeInTheDocument();
    expect(reason()).toHaveValue('');
    expect(screen.getByLabelText('From')).toHaveValue('');
    expect(fixtures.toast.success).toHaveBeenCalledExactlyOnceWith('Leave request sent to your HOD/reporting officer');
    expect(fixtures.toast.error).not.toHaveBeenCalled();
  });

  it('submits an on-duty request with OD type and no proxy teaching prompt', async () => {
    render(<MyLeavesPanel />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'On Duty (OD)' }));
    fillDraft();
    fireEvent.submit(draftForm());
    await waitFor(() => expect(fixtures.toast.success).toHaveBeenCalledWith('On Duty request sent for approval'));
    expect(fixtures.api.post).toHaveBeenCalledWith('/api/hr/workforce/requests', expect.objectContaining({ request_type: 'ON_DUTY', leave_type: 'OD' }));
    expect(screen.queryByText('Proxy teaching options')).not.toBeInTheDocument();
  });

  it('ignores stale read responses when the user changes even if the API instance stays the same', async () => {
    const pending: Array<(rows: unknown[]) => void> = [];
    fixtures.api.get.mockImplementation(() => new Promise<unknown[]>((done) => pending.push(done)));
    const view = render(<MyLeavesPanel />);
    fixtures.auth = { user: { user_id: 'faculty-2' }, token: 'token-1' };
    fixtures.api.get.mockImplementation((path: string) => Promise.resolve(path.endsWith('my-balances') ? [] : [{ ...request, leave_id: 'new-1', reason: 'New account request' }]));
    view.rerender(<MyLeavesPanel />);
    await screen.findByText('New account request');
    await act(async () => { pending[0]([balance]); pending[1]([request]); });
    expect(screen.queryByText('Family appointment')).not.toBeInTheDocument();
    expect(screen.queryByText('Used 2 of 12')).not.toBeInTheDocument();
  });

  it('ignores an old pending save without refreshing or clearing the new account draft', async () => {
    let resolve!: (row: typeof request) => void;
    const oldApi = fixtures.api;
    oldApi.post.mockReturnValue(new Promise<typeof request>((done) => { resolve = done; }));
    const view = render(<MyLeavesPanel />);
    await ready();
    fillDraft();
    fireEvent.submit(draftForm());
    fixtures.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn() };
    fixtures.auth = { user: { user_id: 'faculty-2' }, token: 'token-2' };
    view.rerender(<MyLeavesPanel />);
    await ready();
    fillDraft('New account draft');
    await act(async () => { resolve(request); });
    expect(reason()).toHaveValue('New account draft');
    expect(oldApi.get).toHaveBeenCalledTimes(2);
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText('Family appointment')).not.toBeInTheDocument();
  });

  it('clears the old account read error and disables the draft after sign-out', async () => {
    fixtures.api.get.mockRejectedValue(new Error('Old account offline'));
    const view = render(<MyLeavesPanel />);
    await screen.findByRole('alert');
    fixtures.auth = { user: null, token: null };
    view.rerender(<MyLeavesPanel />);
    await screen.findByText('Sign in to view your leave requests.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('No leave requests yet.')).not.toBeInTheDocument();
    expect(submit()).toBeDisabled();
    expect(fixtures.api.get).toHaveBeenCalledTimes(2);
  });

  it('never creates the old account request after its upload completes in a new scope', async () => {
    let resolve!: (response: { ok: boolean; json: () => Promise<{ url: string }> }) => void;
    fixtures.fetch.mockReturnValue(new Promise((done) => { resolve = done; }));
    const oldApi = fixtures.api;
    const view = render(<MyLeavesPanel />);
    await ready();
    fillDraft();
    attach();
    fireEvent.submit(draftForm());
    fixtures.auth = { user: { user_id: 'faculty-1' }, token: 'new-token' };
    view.rerender(<MyLeavesPanel />);
    await ready();
    fillDraft('New token draft');
    await act(async () => { resolve({ ok: true, json: async () => ({ url: '/uploads/test/old.pdf' }) }); });
    expect(oldApi.post).not.toHaveBeenCalled();
    expect(reason()).toHaveValue('New token draft');
    expect(submit()).toBeEnabled();
    expect(fixtures.toast.success).not.toHaveBeenCalled();
  });
});
