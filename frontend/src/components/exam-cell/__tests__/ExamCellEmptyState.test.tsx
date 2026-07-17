import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExamCellEmptyState } from '@/components/exam-cell/ExamCellEmptyState';

vi.mock('@/lib/api', () => ({
  useAuthedApi: () => ({
    post: vi.fn().mockResolvedValue({ message: 'Seeded' }),
  }),
}));

vi.mock('@/lib/notifications/falcon-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('ExamCellEmptyState', () => {
  it('renders default empty copy', () => {
    render(<ExamCellEmptyState showBootstrap={false} />);
    expect(screen.getByText(/No examination records found/i)).toBeTruthy();
  });

  it('shows bootstrap action by default', async () => {
    render(<ExamCellEmptyState />);
    const btn = screen.getByRole('button', { name: /Create sample data/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
  });

  it('calls onRetry from refresh button', () => {
    const onRetry = vi.fn();
    render(<ExamCellEmptyState onRetry={onRetry} showBootstrap={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
