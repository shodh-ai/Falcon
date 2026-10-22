import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SelectHTMLAttributes } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CalendarPage from '@/app/(portals)/exam-cell/calendar/page';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { roles: ['examcell'] } }) }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
afterEach(() => { vi.useRealTimers(); });

describe('Examination calendar displayed range', () => {
  it('fetches distant months without resetting the displayed cursor during loading', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 21, 12));
    api.get.mockReset().mockImplementation((path: string) => Promise.resolve(path.includes('from=2027-02-01') ? [{
      event_id: 'synthetic-future', source: 'CALENDAR', title: 'Synthetic distant milestone', event_type: 'DEADLINE', event_date: '2027-02-10',
    }] : []));
    render(<CalendarPage />);
    await waitFor(() => expect(screen.getByText('October 2026')).toBeVisible());
    for (const label of ['November 2026', 'December 2026', 'January 2027', 'February 2027']) {
      fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
      await waitFor(() => expect(screen.getByText(label)).toBeVisible());
    }
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('from=2027-02-01&to=2027-02-28'));
    expect(screen.getByText('Synthetic distant milestone')).toBeVisible();
  });
});
