import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ExamCellMyTasksPage from '@/app/(portals)/exam-cell/my-tasks/page';

const { api, toast } = vi.hoisted(() => ({
  api: { get: vi.fn() },
  toast: { error: vi.fn() },
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));

describe('Exam Cell My Tasks', () => {
  it('shows the genuine empty state when the API returns no tasks', async () => {
    api.get.mockResolvedValueOnce([]);

    render(<ExamCellMyTasksPage />);

    expect(await screen.findByText('No pending tasks right now.')).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports an API failure instead of presenting it as a successful empty queue', async () => {
    api.get.mockRejectedValueOnce(new Error('Cannot reach server'));

    render(<ExamCellMyTasksPage />);

    await screen.findByText('No pending tasks right now.');
    expect(toast.error).toHaveBeenCalledWith('Cannot reach server');
    expect(screen.queryByText(/Create sample examination data/i)).toBeNull();
  });
});
