import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamCellAuditLogPage from '@/app/(portals)/exam-cell/audit-log/page';

const { api, toast } = vi.hoisted(() => ({
  api: { get: vi.fn() },
  toast: { error: vi.fn() },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));

beforeEach(() => {
  api.get.mockReset();
  toast.error.mockReset();
});

describe('Examination audit trail', () => {
  it('shows an API failure with retry instead of an empty audit trail', async () => {
    api.get.mockRejectedValueOnce(new Error('Audit unavailable')).mockResolvedValueOnce({ data: [], total: 0 });
    render(<ExamCellAuditLogPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Audit unavailable');
    expect(screen.queryByText('No audit events recorded yet.')).toBeNull();
    expect(screen.queryByText('Showing 0–0 of 0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No audit events recorded yet.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retains the latest filter results when older requests finish later', async () => {
    let finishInitial!: (value: object) => void;
    api.get.mockImplementationOnce(() => new Promise((resolve) => { finishInitial = resolve; }))
      .mockResolvedValueOnce({ data: [], total: 0 });
    render(<ExamCellAuditLogPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Filter by action'), { target: { value: 'PUBLISH' } });
    expect(await screen.findByText('No audit events match this action filter.')).toBeTruthy();
    expect(api.get).toHaveBeenLastCalledWith('/api/exam-cell/audit-log?limit=50&page=1&search=PUBLISH');
    await act(async () => { finishInitial({ data: [{ audit_id: 'old', action: 'OLD_ACTION', resource_type: 'test', resource_id: null, actor_name: null, created_at: '2026-10-19T00:00:00Z' }], total: 1 }); });
    expect(screen.queryByText('OLD ACTION')).toBeNull();
    expect(screen.getByText('No audit events match this action filter.')).toBeTruthy();
  });
});
