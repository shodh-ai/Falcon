import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FinanceBudgetsPage from '../page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks }));
vi.mock('@/lib/notifications/falcon-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('Finance budget allocation page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue([
      {
        budget_id: 'scoped-budget-1',
        department_id: 42,
        department_name: 'Computer Science',
        financial_year: '2026-2027',
        allocated_amount: '100000',
        utilized_amount: '25000',
        encumbered_amount: '10000',
        utilization_percent: 35,
      },
    ]);
    mocks.post.mockResolvedValue({});
  });

  it('uses the tenant budget records for named department selection and submits the selected ID', async () => {
    render(<FinanceBudgetsPage />);
    await screen.findByRole('option', { name: 'Computer Science' });

    expect(screen.queryByPlaceholderText('Department ID')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Department' }), {
      target: { value: '42' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Financial year' }), {
      target: { value: '2026-2027' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Allocation amount' }), {
      target: { value: '125000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save allocation' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/finance/budgets', {
      department_id: 42,
      financial_year: '2026-2027',
      allocated_amount: 125000,
    }));
  });

  it('does not show missing department records as an empty success', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Finance service unavailable'));
    render(<FinanceBudgetsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Finance service unavailable');
    expect(screen.queryByText(/No department budgets are available/)).not.toBeInTheDocument();
  });
});
