import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExamCellEmptyState } from '@/components/exam-cell/ExamCellEmptyState';
import { toast } from '@/lib/notifications/falcon-toast';

const fallbackEnabled = vi.hoisted(() => ({ value: false }));
const post = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  useAuthedApi: () => ({
    post,
  }),
}));

vi.mock('@/lib/notifications/falcon-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/exam-cell/dev-fallback', () => ({
  isExamCellDevFallbackEnabled: () => fallbackEnabled.value,
}));

describe('ExamCellEmptyState', () => {
  beforeEach(() => {
    fallbackEnabled.value = false;
    post.mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('renders default empty copy', () => {
    render(<ExamCellEmptyState showBootstrap={false} />);
    expect(screen.getByText(/No examination records found/i)).toBeTruthy();
  });

  it('hides bootstrap action unless the explicit local demo flag is enabled', async () => {
    render(<ExamCellEmptyState />);
    expect(screen.queryByRole('button', { name: /Create sample data/i })).toBeNull();
  });

  it('allows the bootstrap action only when the explicit local demo flag is enabled', () => {
    fallbackEnabled.value = true;
    render(<ExamCellEmptyState />);
    expect(screen.getByRole('button', { name: /Create sample data/i })).toBeTruthy();
    fallbackEnabled.value = false;
  });

  it('calls onRetry from refresh button', () => {
    const onRetry = vi.fn();
    render(<ExamCellEmptyState onRetry={onRetry} showBootstrap={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('refreshes after the explicitly enabled demo bootstrap succeeds', async () => {
    fallbackEnabled.value = true;
    post.mockResolvedValue({ message: 'Seeded' });
    const onRetry = vi.fn();
    render(<ExamCellEmptyState onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: /Create sample data/i }));

    await waitFor(() => expect(onRetry).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledWith('/api/exam-cell/dev/bootstrap', {});
    expect(toast.success).toHaveBeenCalledWith('Seeded');
  });

  it('reports a bootstrap failure without refreshing', async () => {
    fallbackEnabled.value = true;
    post.mockRejectedValue(new Error('Bootstrap unavailable'));
    const onRetry = vi.fn();
    render(<ExamCellEmptyState onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: /Create sample data/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Bootstrap unavailable'));
    expect(onRetry).not.toHaveBeenCalled();
  });
});
