import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SelectHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamCellResourceAllocationPage from '@/app/(portals)/exam-cell/resource-allocation/page';

const { api, toast } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/components/ui/select', () => ({
  Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
}));

beforeEach(() => {
  api.get.mockReset().mockImplementation((path: string) => Promise.resolve(
    path === '/api/exam-cell/schedules'
      ? [{ exam_schedule_id: 'synthetic-schedule', exam_type: 'END_TERM', exam_date: '2026-11-01', subject_name: 'Synthetic subject' }]
      : path === '/api/exam-cell/blocks-halls' ? [
        { block: 'Block A', halls: [{ name: 'Hall A', capacity: 20 }] },
        { block: 'Empty block', halls: [] },
        { block: 'Block B', halls: [{ name: 'Hall B', capacity: 30 }] },
      ] : [],
  ));
  api.post.mockReset().mockResolvedValue({ allocated: 2, room: 'Hall B', subject_name: 'Synthetic subject' });
  toast.error.mockReset();
  toast.success.mockReset();
});

describe('Examination resource allocation room selection', () => {
  it('blocks assignment when required lookup data fails and retries without showing a false empty room list', async () => {
    const get = api.get.getMockImplementation()!;
    let failed = true;
    api.get.mockImplementation((path: string) => path === '/api/exam-cell/blocks-halls' && failed ? Promise.reject(new Error('Synthetic hall lookup unavailable')) : get(path));
    render(<ExamCellResourceAllocationPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic hall lookup unavailable');
    const submit = screen.getByRole('button', { name: 'Assign roll seats & publish plan' });
    expect(submit).toBeDisabled();
    expect(screen.queryByRole('option', { name: 'No rooms in this block' })).toBeNull();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry resource lookups' }));
    await waitFor(() => expect(submit).toBeEnabled());
    expect(screen.getByLabelText('Room / resource')).toHaveValue('Hall A');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not silently treat a failed faculty lookup as no coordinator and retries', async () => {
    const get = api.get.getMockImplementation()!;
    let failed = true;
    api.get.mockImplementation((path: string) => path.includes('/faculty-roster?') && failed ? Promise.reject(new Error('Synthetic faculty lookup unavailable')) : get(path));
    render(<ExamCellResourceAllocationPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic faculty lookup unavailable');
    const submit = screen.getByRole('button', { name: 'Assign roll seats & publish plan' });
    expect(submit).toBeDisabled();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry faculty roster' }));
    await waitFor(() => expect(submit).toBeEnabled());
    expect(api.post).not.toHaveBeenCalled();
  });

  it('ignores a stale faculty roster after selecting a different examination date', async () => {
    let finishOld!: (rows: object[]) => void;
    api.get.mockImplementation((path: string) => path === '/api/exam-cell/schedules'
      ? Promise.resolve([{ exam_schedule_id: 'first', exam_type: 'END_TERM', exam_date: '2026-11-01' }, { exam_schedule_id: 'second', exam_type: 'END_TERM', exam_date: '2026-11-02' }])
      : path === '/api/exam-cell/blocks-halls' ? Promise.resolve([{ block: 'Block A', halls: [{ name: 'Hall A', capacity: 20 }] }])
        : path.includes('2026-11-01') ? new Promise((resolve) => { finishOld = resolve; }) : Promise.resolve([{ user_id: 'current', name: 'Current synthetic coordinator' }]));
    render(<ExamCellResourceAllocationPage />);
    await screen.findByRole('option', { name: 'END_TERM — 2026-11-02' });
    fireEvent.change(screen.getByLabelText('Subject / exam schedule'), { target: { value: 'second' } });
    await screen.findByRole('option', { name: 'Current synthetic coordinator' });
    await act(async () => finishOld([{ user_id: 'old', name: 'Stale synthetic coordinator' }]));
    expect(screen.queryByRole('option', { name: 'Stale synthetic coordinator' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Current synthetic coordinator' })).toBeTruthy();
  });

  it('submits once and freezes allocation parameters while saving', async () => {
    api.post.mockReturnValue(new Promise(() => {}));
    render(<ExamCellResourceAllocationPage />);
    const submit = screen.getByRole('button', { name: 'Assign roll seats & publish plan' });
    await waitFor(() => expect(submit).toBeEnabled());
    await act(async () => { fireEvent.click(submit); fireEvent.click(submit); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Subject / exam schedule')).toBeDisabled();
    expect(screen.getByLabelText('Room / resource')).toBeDisabled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not submit a stale room from another block and restores a valid room after switching back', async () => {
    render(<ExamCellResourceAllocationPage />);
    await waitFor(() => expect(screen.getByLabelText('Room / resource')).toHaveValue('Hall A'));
    const block = screen.getByLabelText('Block');
    const submit = screen.getByRole('button', { name: 'Assign roll seats & publish plan' });
    await waitFor(() => expect(submit).toBeEnabled());

    fireEvent.change(block, { target: { value: 'Empty block' } });
    expect(screen.getByLabelText('Room / resource')).toBeDisabled();
    expect(screen.getByLabelText('Room / resource')).toHaveValue('');
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.change(block, { target: { value: 'Block B' } });
    expect(screen.getByLabelText('Room / resource')).toHaveValue('Hall B');
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/exam-cell/seating/assign-resource', expect.objectContaining({
      exam_schedule_id: 'synthetic-schedule', block: 'Block B', room: 'Hall B', semester: 4,
    })));
    await waitFor(() => expect(submit).toBeEnabled());

    fireEvent.change(block, { target: { value: 'Block A' } });
    expect(screen.getByLabelText('Room / resource')).toHaveValue('Hall A');
    expect(submit).toBeEnabled();
  });
});
