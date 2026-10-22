import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickActionMenu } from '../QuickActionMenu';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'Faculty', roles: ['Faculty'] } }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/faculty/dashboard', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => ({ post: vi.fn() }) }));
vi.mock('@/components/ui/dropdown-menu', () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { DropdownMenu: Wrapper, DropdownMenuContent: Wrapper, DropdownMenuTrigger: Wrapper, DropdownMenuLabel: Wrapper,
    DropdownMenuSeparator: () => null, DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => <button onClick={onClick}>{children}</button> };
});

describe('Quick Action dialogs', () => {
  afterEach(cleanup);
  it('keeps both Leave/OD choices visible and retains each draft while switching', () => {
    render(<QuickActionMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply for Leave / OD' }));
    fireEvent.change(screen.getByPlaceholderText('Reason'), { target: { value: 'Leave draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'On Duty', exact: true }));
    const od = screen.getByRole('dialog');
    expect(within(od).getByRole('button', { name: 'Leave', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(within(od).getByRole('button', { name: 'On Duty', exact: true })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByPlaceholderText('Purpose / venue'), { target: { value: 'OD draft' } });
    fireEvent.click(within(od).getByRole('button', { name: 'Leave', exact: true }));
    expect(screen.getByPlaceholderText('Reason')).toHaveValue('Leave draft');
    fireEvent.click(screen.getByRole('button', { name: 'On Duty', exact: true }));
    expect(screen.getByPlaceholderText('Purpose / venue')).toHaveValue('OD draft');
  });

  it.each(['Apply for Leave / OD', 'Raise IT Ticket', 'Request Meeting Room'])('centres an accessible fixed-size close control in %s', (name) => {
    render(<QuickActionMenu />);
    fireEvent.click(screen.getByRole('button', { name, exact: true }));
    const close = within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' });
    expect(close.className).toContain('h-11 w-11');
    expect(close.className).toContain('items-center justify-center');
    expect(close.className).toContain('focus-visible:ring-2');
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
