import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HrReportsPage from '@/app/(portals)/hr/reports/page';

const { fetchMock, success, error, click } = vi.hoisted(() => ({ fetchMock: vi.fn(), success: vi.fn(), error: vi.fn(), click: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('@/context/HrEntityContext', () => ({ useHrEntity: () => ({ withEntityQuery: (url: string) => `${url}${url.includes('?') ? '&' : '?'}entity_id=7` }) }));
vi.mock('@/lib/tenant', () => ({ getSubdomainFromClient: () => 'test' }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success, error } }));

describe('HR reports UI', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset().mockResolvedValue({ ok: true, blob: async () => new Blob(['xlsx']) });
    success.mockReset(); error.mockReset(); click.mockReset();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('changing balance year does not overwrite the selected report month', async () => {
    render(<HrReportsPage />);
    const month = screen.getByLabelText('Report month');
    fireEvent.change(month, { target: { value: '2026-02' } });
    fireEvent.change(screen.getByLabelText('Balance year'), { target: { value: '2025' } });
    expect(month).toHaveValue('2026-02');
    // Use the report header to avoid relying on decorative card class names.
    const header = screen.getByText('Missing Punches Report').parentElement!.parentElement!.parentElement!;
    fireEvent.click(within(header).getByRole('button', { name: /Download/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain('missing-punches?month=2026-02&entity_id=7');
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('explains missing report data without downloading an empty spreadsheet', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: 'No report data is available for 2026-02. No file was generated.' }) });
    render(<HrReportsPage />);
    fireEvent.click(screen.getAllByRole('button', { name: /Download/ })[0]);
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining('No report data')));
    expect(click).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });
});
