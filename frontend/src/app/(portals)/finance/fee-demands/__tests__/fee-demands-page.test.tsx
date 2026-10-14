import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FinanceFeeDemandsPage from '../page';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));

describe('fee demand list', () => {
  afterEach(cleanup);

  it('loads the first tenant-scoped page and displays generated demand details', async () => {
    api.get.mockResolvedValueOnce([{
      demand_id: 'demand-1', student_user_id: 'student-1',
      fee_head: 'SEMESTER_FEE', academic_year: '2026-27', semester: 5,
      total_amount: '1500', paid_amount: '0', due_date: '2026-11-10', status: 'PENDING',
    }]);
    render(<FinanceFeeDemandsPage />);
    expect(await screen.findByText('SEMESTER FEE')).toBeInTheDocument();
    expect(screen.getByText('2026-27 · Semester 5')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/finance/demands?limit=100&offset=0');
  });
});
