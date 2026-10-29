import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Page from '@/app/(portals)/exam-cell/admit-cards/page';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { user_id: 'actor', tenant_id: 'tenant', role: 'ExamCell' } }) }));
vi.mock('@/components/exam-cell/HallTicketReadiness', () => ({ default: ({ sessionId, onSessionChange, onOpenApprovals }: { sessionId: string; onSessionChange: (id: string) => void; onOpenApprovals: () => void }) => <div><span>Readiness session: {sessionId}</span><button onClick={() => onSessionChange('verified-session')}>Select session</button><button onClick={onOpenApprovals}>Open approval queue</button></div> }));
vi.mock('@/components/exam-cell/HallTicketApprovals', () => ({ default: ({ sessionId }: { sessionId: string }) => <div>Approval session: {sessionId}</div> }));

describe('Unified Hall Ticket workspace', () => {
  it('opens approvals in the same workspace and preserves the selected session', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { name: 'Hall Tickets' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    // The shared tab list defaults to h-9. Taller workspace tabs must override
    // that orientation-specific height so they cannot overflow into the cards.
    expect(screen.getByRole('tablist')).toHaveClass('group-data-[orientation=horizontal]/tabs:h-auto');
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveClass('h-auto', 'min-w-0');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Select session' }));
    fireEvent.click(screen.getByText('Open approval queue'));
    expect(screen.getByText('Approval session: verified-session')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Approval queue' })).toHaveAttribute('aria-selected', 'true');
  });
});
