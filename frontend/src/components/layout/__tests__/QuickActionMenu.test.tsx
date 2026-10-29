import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickActionMenu } from '../QuickActionMenu';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  useAuthedApi: () => ({ post: mocks.post }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'Faculty' } }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/faculty/dashboard',
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/lib/notifications/falcon-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button role="menuitem" onClick={onClick}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

describe('QuickActionMenu on-duty request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue({});
  });

  it('submits one selected OD date for both backend date fields with times and purpose', async () => {
    render(<QuickActionMenu />);

    fireEvent.click(screen.getByRole('menuitem', { name: /Apply for Leave \/ OD/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'On Duty' }));

    fireEvent.change(screen.getByLabelText('On Duty Date'), {
      target: { value: '2026-11-02' },
    });
    fireEvent.change(screen.getByLabelText('Departure Time'), {
      target: { value: '09:15' },
    });
    fireEvent.change(screen.getByLabelText('Expected Return Time'), {
      target: { value: '16:30' },
    });
    fireEvent.change(screen.getByLabelText('Purpose / Venue'), {
      target: { value: 'University finance workshop' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit OD' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith('/api/hr/workforce/requests', {
      request_type: 'ON_DUTY',
      leave_type: 'OD',
      start_date: '2026-11-02',
      end_date: '2026-11-02',
      start_time: '09:15',
      end_time: '16:30',
      reason: 'University finance workshop',
    });
  });
});
