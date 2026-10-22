import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExamCellEmptyState } from '@/components/exam-cell/ExamCellEmptyState';

const fallbackEnabled = vi.hoisted(() => ({ value: false }));

vi.mock('@/lib/api', () => ({
  useAuthedApi: () => ({
    post: vi.fn().mockResolvedValue({ message: 'Seeded' }),
  }),
}));

vi.mock('@/lib/notifications/falcon-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/exam-cell/dev-fallback', () => ({
  isExamCellDevFallbackEnabled: () => fallbackEnabled.value,
}));

describe('ExamCellEmptyState', () => {
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
});
