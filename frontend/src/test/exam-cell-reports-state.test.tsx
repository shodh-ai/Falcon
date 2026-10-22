import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReportsPage from '@/app/(portals)/exam-cell/reports/page';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { error: vi.fn() } }));

describe('Examination reports', () => {
  it('renders PostgreSQL numeric grade-point strings after selecting the requested semester', async () => {
    const summary = { semester: 4, pass_fail: [], pass_percentage: 0, top_rankers: [], department_enrollment: [], pending_backlog: 0 };
    api.get.mockReset().mockResolvedValueOnce(summary).mockResolvedValueOnce({
      ...summary, semester: 8, top_rankers: [{ name: 'Synthetic numeric ranker', enrollment_number: 'SYNTHETIC-NUMERIC', cgpa: '9.20', sgpa: '8.650' }],
    });
    render(<ReportsPage />);
    await screen.findByText('Top rankers — Semester 4');
    fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '8' } });
    const row = (await screen.findByText('Synthetic numeric ranker')).closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[3]).toHaveTextContent('9.20');
    expect(cells[4]).toHaveTextContent('8.65');
    expect(api.get).toHaveBeenLastCalledWith('/api/exam-cell/reports/summary?semester=8');
  });

  it('keeps genuine numeric zero while showing missing and invalid grade points as unavailable', async () => {
    api.get.mockReset().mockResolvedValue({
      semester: 8, pass_fail: [], pass_percentage: 0, department_enrollment: [], pending_backlog: 0,
      top_rankers: [
        { name: 'Synthetic numeric zero', enrollment_number: 'SYNTHETIC-ZERO', cgpa: 0, sgpa: '0.00' },
        { name: 'Synthetic missing points', enrollment_number: 'SYNTHETIC-NULL', cgpa: null, sgpa: undefined },
        { name: 'Synthetic blank points', enrollment_number: 'SYNTHETIC-BLANK', cgpa: '', sgpa: '  ' },
        { name: 'Synthetic invalid points', enrollment_number: 'SYNTHETIC-INVALID', cgpa: 'not a number', sgpa: 'Infinity' },
        { name: 'Synthetic nonfinite points', enrollment_number: 'SYNTHETIC-NONFINITE', cgpa: Number.NaN, sgpa: Number.POSITIVE_INFINITY },
      ],
    });
    render(<ReportsPage />);
    const zero = (await screen.findByText('Synthetic numeric zero')).closest('tr')!;
    expect(within(zero).getAllByRole('cell').slice(3).map((cell) => cell.textContent)).toEqual(['0.00', '0.00']);
    ['Synthetic missing points', 'Synthetic blank points', 'Synthetic invalid points', 'Synthetic nonfinite points'].forEach((name) => {
      const row = screen.getByText(name).closest('tr')!;
      expect(within(row).getAllByRole('cell').slice(3).map((cell) => cell.textContent)).toEqual(['—', '—']);
    });
  });

  it('keeps a failed report visible and retries the current semester', async () => {
    api.get.mockReset().mockRejectedValueOnce(new Error('Reports unavailable')).mockResolvedValueOnce({ semester: 4, pass_fail: [], pass_percentage: 0, top_rankers: [], department_enrollment: [{ department: 'Synthetic department', students: 1 }], pending_backlog: 0 });
    render(<ReportsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Reports unavailable');
    expect(screen.queryByText('Pass percentage')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Pass percentage')).toBeTruthy();
    expect(screen.getByText('1 student')).toBeTruthy();
    expect(api.get).toHaveBeenLastCalledWith('/api/exam-cell/reports/summary?semester=4');
  });
});
