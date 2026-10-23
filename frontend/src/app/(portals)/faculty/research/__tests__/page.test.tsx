import type { SelectHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyResearchPage from '../page';

const fixtures = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, toast: { success: vi.fn(), error: vi.fn() } }));
const publication = { research_id: 'research-1', publication_title: 'Study publication', journal_name: 'Journal', indexing_type: 'SCOPUS', publication_type: 'JOURNAL', published_date: '2026-10-23' };
vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { user_id: 'faculty-1', tenant_id: 'tenant-1' }, token: 'test-token' }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/lib/faculty-demo-mode', () => ({ withFacultyDemoFallback: (live: unknown) => live, isEmptyArray: (value: unknown) => Array.isArray(value) && !value.length, isFacultyDemoEntityId: () => false, isFacultyDemoModeEnabled: () => false }));
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn().mockResolvedValue(publication) };
});
afterEach(cleanup);
const titleInput = () => screen.getByPlaceholderText('Publication title');
const save = () => screen.getByRole('button', { name: 'Save to research log' });
function fillTitle() { fireEvent.change(titleInput(), { target: { value: '  Study publication  ' } }); }
function attachProof() {
  const file = new File(['proof'], 'proof.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Proof document'), { target: { files: [file] } });
  return file;
}

describe('research publication integrity', () => {
  it('offers access to existing publication proof without saving or uploading anything', async () => {
    fixtures.api.get.mockResolvedValue([{ ...publication, proof_file_path: '/uploads/tenant-1/proof.pdf' }]);
    render(<FacultyResearchPage />);
    await screen.findByText('Study publication');
    expect(screen.getByRole('button', { name: 'Download publication proof' })).toBeEnabled();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('shows loading instead of empty until a successful publications response', async () => {
    let resolve!: (rows: typeof publication[]) => void;
    fixtures.api.get.mockReturnValue(new Promise<typeof publication[]>((done) => { resolve = done; }));
    render(<FacultyResearchPage />);
    expect(screen.getByText('Loading publications…')).toBeInTheDocument();
    expect(screen.queryByText('No publications logged yet.')).not.toBeInTheDocument();
    await act(async () => { resolve([]); });
    expect(screen.getByText('No publications logged yet.')).toBeInTheDocument();
  });

  it('retries a read error and displays publication dates as calendar dates', async () => {
    fixtures.api.get.mockRejectedValueOnce(new Error('Publications unavailable'));
    render(<FacultyResearchPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Publications unavailable');
    expect(screen.queryByText('No publications logged yet.')).not.toBeInTheDocument();
    fixtures.api.get.mockResolvedValue([{ ...publication, published_date: '2026-10-23T23:30:00-07:00' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry publications' }));
    await screen.findByText('Study publication');
    expect(screen.getByText('23 Oct 2026')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not create a publication when proof upload returns no file pointer', async () => {
    fixtures.api.post.mockResolvedValue({ url: ' ', path: '' });
    render(<FacultyResearchPage />);
    await screen.findByText('No publications logged yet.');
    fillTitle();
    attachProof();
    fireEvent.click(save());
    await waitFor(() => expect(fixtures.toast.error).toHaveBeenCalledWith('Proof upload returned no file location. Please retry.'));
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
    expect(fixtures.api.post).toHaveBeenCalledWith('/api/uploads/single', expect.any(FormData));
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(titleInput()).toHaveValue('  Study publication  ');
    expect(save()).toBeEnabled();
  });

  it('retains a failed draft and file and reuses its successful upload on retry', async () => {
    let creates = 0;
    fixtures.api.post.mockImplementation(async (path: string) => {
      if (path === '/api/uploads/single') return { url: '/uploads/tenant/proof.pdf' };
      if (creates++ === 0) throw new Error('Save unavailable');
      return publication;
    });
    render(<FacultyResearchPage />);
    await screen.findByText('No publications logged yet.');
    fillTitle();
    const file = attachProof();
    fireEvent.click(save());
    await waitFor(() => expect(fixtures.toast.error).toHaveBeenCalledWith('Save unavailable'));
    expect(titleInput()).toHaveValue('  Study publication  ');
    expect((screen.getByLabelText('Proof document') as HTMLInputElement).files?.[0]).toBe(file);
    fixtures.api.get.mockResolvedValue([publication]);
    fireEvent.click(save());
    await waitFor(() => expect(fixtures.toast.success).toHaveBeenCalledWith('Research entry logged (feeds HR PMS & IQAC)'));
    expect(fixtures.api.post.mock.calls.filter(([path]) => path === '/api/uploads/single')).toHaveLength(1);
    expect(fixtures.api.post).toHaveBeenLastCalledWith('/api/academics/faculty/workspaces/research', expect.objectContaining({ publication_title: 'Study publication', published_date: undefined, proof_file_path: '/uploads/tenant/proof.pdf' }));
    expect(titleInput()).toHaveValue('');
  });

  it('prevents same-tick duplicate saves and locks draft fields during the request', async () => {
    let resolve!: (value: typeof publication) => void;
    fixtures.api.post.mockReturnValue(new Promise<typeof publication>((done) => { resolve = done; }));
    render(<FacultyResearchPage />);
    await screen.findByText('No publications logged yet.');
    fillTitle();
    const form = titleInput().closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
    expect(titleInput()).toBeDisabled();
    expect(screen.getByPlaceholderText('Journal / conference')).toBeDisabled();
    expect(screen.getByLabelText('Publication date')).toBeDisabled();
    expect(screen.getByLabelText('Proof document')).toBeDisabled();
    for (const select of screen.getAllByRole('combobox')) expect(select).toBeDisabled();
    await act(async () => { resolve(publication); });
  });

  it('keeps a successful save distinct from a failed list refresh and clears the saved draft', async () => {
    fixtures.api.get.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Refresh unavailable'));
    render(<FacultyResearchPage />);
    await screen.findByText('No publications logged yet.');
    fillTitle();
    fireEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('Publication saved, but the list could not be refreshed. Refresh unavailable');
    expect(screen.getByText('Study publication')).toBeInTheDocument();
    expect(titleInput()).toHaveValue('');
    expect(fixtures.toast.success).toHaveBeenCalledExactlyOnceWith('Research entry logged (feeds HR PMS & IQAC)');
    expect(fixtures.toast.error).not.toHaveBeenCalled();
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
  });

  it('ignores an old account read after the API scope changes', async () => {
    let resolve!: (rows: typeof publication[]) => void;
    fixtures.api.get.mockReturnValue(new Promise<typeof publication[]>((done) => { resolve = done; }));
    const view = render(<FacultyResearchPage />);
    fixtures.api = { get: vi.fn().mockResolvedValue([{ ...publication, research_id: 'new-1', publication_title: 'New account publication' }]), post: vi.fn() };
    view.rerender(<FacultyResearchPage />);
    await screen.findByText('New account publication');
    await act(async () => { resolve([publication]); });
    expect(screen.queryByText('Study publication')).not.toBeInTheDocument();
  });

  it('ignores an old account save without clearing the new account draft or refreshing with the old API', async () => {
    let resolve!: (value: typeof publication) => void;
    const oldApi = fixtures.api;
    oldApi.post.mockReturnValue(new Promise<typeof publication>((done) => { resolve = done; }));
    const view = render(<FacultyResearchPage />);
    await screen.findByText('No publications logged yet.');
    fillTitle();
    fireEvent.click(save());
    fixtures.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn() };
    view.rerender(<FacultyResearchPage />);
    await screen.findByText('No publications logged yet.');
    fireEvent.change(titleInput(), { target: { value: 'New account draft' } });
    await act(async () => { resolve(publication); });
    expect(titleInput()).toHaveValue('New account draft');
    expect(oldApi.get).toHaveBeenCalledTimes(1);
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText('Study publication')).not.toBeInTheDocument();
  });
});
