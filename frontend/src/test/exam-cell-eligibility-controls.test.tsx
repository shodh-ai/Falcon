import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import EligibilityPage from '@/app/(portals)/exam-cell/eligibility/page';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { error: vi.fn() } }));
// Isolate request ordering and paging; the actual Radix selects are exercised in the browser.
vi.mock('@/components/ui/select', () => ({ Select: (props: ComponentProps<'select'>) => <select {...props} /> }));
const dashboard = (names: string[], semester = 4) => ({
  semester, total: names.length, summary: { ELIGIBLE: names.length },
  items: names.map((name) => ({ student_user_id: name, name, enrollment_number: name, category: 'ELIGIBLE', attendance_percent: 90, fee_clear: true, block_reasons: [] })),
});

describe('Eligibility register controls', () => {
  it('paginates records and supports keyboard-accessible status filtering', async () => {
    api.get.mockReset().mockResolvedValueOnce(dashboard(Array.from({ length: 21 }, (_, i) => `Synthetic ${i + 1}`)));
    render(<EligibilityPage />);
    await screen.findByText('Showing 1–20 of 21');
    expect(screen.queryByText('Synthetic 21')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByText('Synthetic 21').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'ELIGIBLE 21' }));
    expect(screen.getByText('Showing 1–20 of 21')).toBeTruthy();
    expect(screen.getByLabelText('Eligibility status')).toHaveValue('ELIGIBLE');
  });

  it('does not export old semester data or allow an old response to replace the selected semester', async () => {
    let resolveOld!: (value: ReturnType<typeof dashboard>) => void;
    api.get.mockReset()
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(dashboard(['Current semester student'], 5));
    render(<EligibilityPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Export eligibility CSV' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '5' } });
    await screen.findAllByText('Current semester student');
    await act(async () => resolveOld(dashboard(['Stale semester student'])));
    expect(screen.queryByText('Stale semester student')).toBeNull();
    expect(screen.getByLabelText('Semester')).toHaveValue('5');
  });

  it('shows a retryable failure separately from an empty register', async () => {
    api.get.mockReset().mockRejectedValueOnce(new Error('Eligibility unavailable')).mockResolvedValueOnce(dashboard([]));
    render(<EligibilityPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Eligibility unavailable');
    expect(screen.queryByText('No students enrolled for this semester.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No students enrolled for this semester.')).toBeTruthy();
  });
});
