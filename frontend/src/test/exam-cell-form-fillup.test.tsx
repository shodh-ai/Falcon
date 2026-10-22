import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SelectHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamCellFormFillupPage from '@/app/(portals)/exam-cell/form-fillup/page';

const { api, toast } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { roles: ['examcell'] } }) }));
vi.mock('@/components/ui/select', () => ({
  Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
}));

const windows = [
  { window_id: 'synthetic-window-a', title: 'Synthetic window A', semester: 4, program_label: 'B.Tech', opens_at: '2026-10-01T10:00:00Z', closes_at: '2026-10-31T10:00:00Z', status: 'DRAFT' },
  { window_id: 'synthetic-window-b', title: 'Synthetic window B', semester: 4, program_label: 'B.Tech', opens_at: '2026-10-01T10:00:00Z', closes_at: '2026-10-31T10:00:00Z', status: 'OPEN' },
];
const registrations = [
  { registration_id: 'synthetic-registration-a', student_name: 'Synthetic student A', enrollment_number: 'SYN-A', semester: 4, fee_status: 'PAID', status: 'PENDING', eligibility_snapshot: { eligible: true } },
  { registration_id: 'synthetic-registration-b', student_name: 'Synthetic student B', enrollment_number: 'SYN-B', semester: 4, fee_status: 'PAID', status: 'APPROVED', eligibility_snapshot: { eligible: true } },
];

beforeEach(() => {
  api.get.mockReset().mockImplementation((path: string) => Promise.resolve(
    path === '/api/exam-cell/form-windows' ? windows : path.includes('window_id=synthetic-window-a') ? [registrations[0]] : registrations,
  ));
  api.post.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
});

describe('Form Fill-up registration controls', () => {
  it('keeps All windows selected and reloads the complete queue after a specific window filter', async () => {
    render(<ExamCellFormFillupPage />);
    await screen.findByText('Synthetic student B');
    const windowFilter = screen.getByLabelText('Registration window');
    expect(windowFilter).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Sync student registrations' })).toBeNull();

    fireEvent.change(windowFilter, { target: { value: 'synthetic-window-a' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/exam-cell/registrations?window_id=synthetic-window-a'));
    await screen.findByText('Synthetic student A');
    expect(screen.queryByText('Synthetic student B')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sync student registrations' })).toBeTruthy();

    fireEvent.change(windowFilter, { target: { value: '' } });
    await screen.findByText('Synthetic student B');
    expect(windowFilter).toHaveValue('');
    expect(screen.getByText('Synthetic student A')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sync student registrations' })).toBeNull();
    expect(api.get).toHaveBeenLastCalledWith('/api/exam-cell/registrations');
  });

  it('disables window actions while a status update is pending', async () => {
    let finishUpdate!: (value: object) => void;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { finishUpdate = resolve; }));
    render(<ExamCellFormFillupPage />);
    await screen.findByText('Synthetic student B');
    const open = screen.getByRole('button', { name: 'Open' });
    fireEvent.click(open);
    expect(open).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    fireEvent.click(open);
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => { finishUpdate({}); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open' })).toBeEnabled());
    expect(api.post).toHaveBeenCalledWith('/api/exam-cell/form-windows/synthetic-window-a/status', { status: 'OPEN' });
  });
});
