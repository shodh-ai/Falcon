import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '../AppSidebar';
import HrPayslipDownloadRequestsPage from '@/app/(portals)/hr/payroll/payslip-downloads/page';

vi.mock('next/navigation', () => ({ usePathname: () => '/hr/inbox' }));
vi.mock('@/components/brand/FalconLogo', () => ({
  FalconLogo: ({ size }: { size: number }) => <span data-testid="falcon-logo" data-size={size} />,
}));

describe('HR report visual controls', () => {
  afterEach(cleanup);

  it('keeps the collapsed logo and expand control in separate stacked positions', () => {
    render(<AppSidebar personaLabel="HR" navGroups={[]} collapsed onToggleCollapse={vi.fn()} />);
    const logo = screen.getByTestId('falcon-logo');
    const toggle = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(logo).toHaveAttribute('data-size', '28');
    expect(logo.parentElement).toBe(toggle.parentElement);
    expect(toggle.parentElement).toHaveClass('flex-col');
    expect(toggle).not.toHaveClass('absolute');
  });

  it('reserves separate space for the status filter icon, label and chevron', () => {
    render(<HrPayslipDownloadRequestsPage />);
    const filter = screen.getByRole('combobox', { name: 'Filter by request status' });
    expect(filter).toHaveClass('pl-10', 'pr-10');
    expect(filter.parentElement?.querySelectorAll('svg')).toHaveLength(2);
    expect(filter).toHaveValue('ALL');
  });
});
