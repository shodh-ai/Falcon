import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FacultyPortfolioPanel } from '../FacultyPortfolioPanel';

vi.mock('@/lib/notifications/falcon-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('FacultyPortfolioPanel', () => {
  it('loads current skills and records a completed-work milestone with idempotency', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ skills: ['Research'], work: [], history: [] }),
      post: vi.fn().mockResolvedValue({ skills: ['Research'], work: [], history: [] }),
    };
    render(<FacultyPortfolioPanel api={api} basePath="/api/academics/faculty/profile/portfolio" />);
    expect(await screen.findByText('Research')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('What did you complete?'), {
      target: { value: 'Designed new practical course' },
    });
    fireEvent.change(screen.getByLabelText('Completed on'), {
      target: { value: '2026-01-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record completed work' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/academics/faculty/profile/portfolio/work',
      expect.objectContaining({ title: 'Designed new practical course', completed_on: '2026-01-01' }),
      expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
    ));
  });
});
