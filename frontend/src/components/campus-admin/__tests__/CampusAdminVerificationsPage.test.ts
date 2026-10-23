import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampusAdminVerificationsPage, mergeVerificationQueueResults } from '@/components/campus-admin/CampusAdminVerificationsPage';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const auth = vi.hoisted(() => ({ token: 'test-token', user: { user_id: 'campus-admin-1' } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));

const facultyRow = {
  user_id: 'faculty-1',
  name: 'Dr Amit Kaushik',
  official_email: 'amit.kaushik@mygyanvihar.com',
  onboarding_status: 'PENDING_ADMIN_APPROVAL',
  role_name: 'Faculty',
  portal_kind: 'staff',
  submitted_at: null,
  doc_count: '4',
};

describe('campus-admin verification queue merging', () => {
  it('keeps faculty submissions visible when the student queue fails', () => {
    const result = mergeVerificationQueueResults([
      { status: 'rejected', reason: new Error('403 Forbidden') },
      { status: 'fulfilled', value: [facultyRow] },
    ]);

    expect(result.rows).toEqual([facultyRow]);
    expect(result.error).toContain('student queue: 403 Forbidden');
  });

  it('reports both failures when neither queue is available', () => {
    const result = mergeVerificationQueueResults([
      { status: 'rejected', reason: new Error('student unavailable') },
      { status: 'rejected', reason: new Error('faculty unavailable') },
    ]);

    expect(result.rows).toEqual([]);
    expect(result.error).toContain('student queue: student unavailable');
    expect(result.error).toContain('faculty queue: faculty unavailable');
  });
});

describe('campus-admin live verification queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.get.mockReset().mockResolvedValue([]);
    api.post.mockReset().mockResolvedValue({});
    auth.token = 'test-token';
    auth.user = { user_id: 'campus-admin-1' };
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows a new faculty submission when the admin returns to the window', async () => {
    await act(async () => { render(createElement(CampusAdminVerificationsPage)); });
    expect(screen.getByText('No users awaiting verification on this campus.')).toBeInTheDocument();
    api.get.mockImplementation(async (path: string) => path.includes('/staff/') ? [facultyRow] : []);

    await act(async () => { fireEvent.focus(window); });

    expect(screen.getByText(facultyRow.name)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(4);
  });

  it('polls visible pages, skips hidden pages, and stops after unmount', async () => {
    const view = render(createElement(CampusAdminVerificationsPage));
    await act(async () => {});
    api.get.mockImplementation(async (path: string) => path.includes('/staff/') ? [facultyRow] : []);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText(facultyRow.name)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(4);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); fireEvent.focus(window); });
    expect(api.get).toHaveBeenCalledTimes(4);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => { fireEvent(document, new Event('visibilitychange')); });
    expect(api.get).toHaveBeenCalledTimes(6);
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
      fireEvent.focus(window);
      fireEvent(document, new Event('visibilitychange'));
    });
    expect(api.get).toHaveBeenCalledTimes(6);
  });

  it('keeps existing rows visible and avoids overlapping manual and automatic refreshes', async () => {
    api.get.mockImplementation(async (path: string) => path.includes('/staff/') ? [facultyRow] : []);
    await act(async () => { render(createElement(CampusAdminVerificationsPage)); });
    let finishStaff!: (rows: typeof facultyRow[]) => void;
    api.get.mockImplementation((path: string) => path.includes('/staff/')
      ? new Promise<typeof facultyRow[]>((resolve) => { finishStaff = resolve; })
      : Promise.resolve([]));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); });
    expect(screen.getByText(facultyRow.name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    await act(async () => { fireEvent.focus(window); await vi.advanceTimersByTimeAsync(30_000); });
    expect(api.get).toHaveBeenCalledTimes(4);

    await act(async () => { finishStaff([facultyRow]); });
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it('ignores a cancelled document preview that finishes after a newer selection', async () => {
    const documents = [
      { doc_id: 'photo', doc_type: 'PHOTO', file_path: '/photo.png', status: 'PENDING' },
      { doc_id: 'pan', doc_type: 'PAN', file_path: '/pan.png', status: 'PENDING' },
    ];
    api.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/queue')) return path.includes('/staff/') ? [facultyRow] : [];
      return {
        portal_kind: 'staff',
        person: { ...facultyRow, email: facultyRow.official_email },
        documents,
      };
    });
    let finishPhoto!: (response: Response) => void;
    let finishPan!: (response: Response) => void;
    const fetchPreview = vi.fn<(url: string, init: RequestInit) => Promise<Response>>((url) => new Promise<Response>((resolve) => {
      if (url.includes('/PHOTO/')) finishPhoto = resolve;
      else finishPan = resolve;
    }));
    vi.stubGlobal('fetch', fetchPreview);
    const createPreviewUrl = vi.fn().mockReturnValue('blob:image/pan');
    const revokePreviewUrl = vi.fn();
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createPreviewUrl;
      static revokeObjectURL = revokePreviewUrl;
    });
    const response = () => ({ ok: true, blob: async () => new Blob(['fixture']) }) as Response;
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(createElement(CampusAdminVerificationsPage)); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Review' })); });
    expect(fetchPreview).toHaveBeenCalledTimes(1);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'PAN Card' })); });
    expect(fetchPreview.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(screen.queryByAltText('Document preview')).not.toBeInTheDocument();
    await act(async () => { finishPan(response()); });
    expect(screen.getByAltText('Document preview')).toHaveAttribute('src', 'blob:image/pan');

    // A transport may finish despite cancellation; it must not replace the new preview.
    await act(async () => { finishPhoto(response()); });
    expect(createPreviewUrl).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText('Document preview')).toHaveAttribute('src', 'blob:image/pan');
    view.unmount();
    expect(revokePreviewUrl).toHaveBeenCalledWith('blob:image/pan');
  });

  it('never renders an earlier person detail or unlocks decisions while the next review is loading', async () => {
    const nextRow = { ...facultyRow, user_id: 'faculty-2', name: 'Second Faculty' };
    const detail = (row: typeof facultyRow) => ({ portal_kind: 'staff', person: { ...row, email: row.official_email }, documents: [] });
    let finishFirst!: (value: ReturnType<typeof detail>) => void;
    let finishSecond!: (value: ReturnType<typeof detail>) => void;
    api.get.mockImplementation((path: string) => {
      if (path.endsWith('/queue')) return Promise.resolve(path.includes('/staff/') ? [facultyRow, nextRow] : []);
      return new Promise<ReturnType<typeof detail>>(resolve => {
        if (path.endsWith('/faculty-1')) finishFirst = resolve;
        else finishSecond = resolve;
      });
    });
    await act(async () => { render(createElement(CampusAdminVerificationsPage)); });
    const reviews = screen.getAllByRole('button', { name: 'Review' });
    await act(async () => { fireEvent.click(reviews[0]); fireEvent.click(reviews[1]); });
    await act(async () => { finishFirst(detail(facultyRow)); });
    expect(screen.getByText('Loading details…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: facultyRow.name })).not.toBeInTheDocument();
    await act(async () => { finishSecond(detail(nextRow)); });
    expect(screen.getByRole('heading', { name: nextRow.name })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Approve' })); });
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/staff/verifications/faculty-2/approve');
  });

  it('invalidates a closed detail request and ignores its late failure during a new review', async () => {
    let failFirst!: (error: Error) => void;
    api.get.mockImplementation((path: string) => {
      if (path.endsWith('/queue')) return Promise.resolve(path.includes('/staff/') ? [facultyRow] : []);
      return new Promise((_resolve, reject) => { failFirst = reject; });
    });
    await act(async () => { render(createElement(CampusAdminVerificationsPage)); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Review' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Close' })); });
    api.get.mockResolvedValue({ portal_kind: 'staff', person: { ...facultyRow, email: facultyRow.official_email }, documents: [] });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Review' })); });
    expect(screen.getByRole('heading', { name: facultyRow.name })).toBeInTheDocument();
    await act(async () => { failFirst(new Error('Old request failed')); });
    expect(screen.getByRole('heading', { name: facultyRow.name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('clears private review state immediately when the administrator account changes', async () => {
    let finish!: (value: object) => void;
    api.get.mockImplementation((path: string) => path.endsWith('/queue')
      ? Promise.resolve(path.includes('/staff/') ? [facultyRow] : [])
      : new Promise(resolve => { finish = resolve; }));
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(createElement(CampusAdminVerificationsPage)); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Review' })); });
    auth.token = 'second-token';
    auth.user = { user_id: 'campus-admin-2' };
    api.get.mockResolvedValue([]);
    await act(async () => { view.rerender(createElement(CampusAdminVerificationsPage)); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => { finish({ portal_kind: 'staff', person: { ...facultyRow, email: facultyRow.official_email }, documents: [] }); });
    expect(screen.queryByRole('heading', { name: facultyRow.name })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });
});
