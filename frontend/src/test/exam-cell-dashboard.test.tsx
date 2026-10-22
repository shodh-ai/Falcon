import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ExamCellDashboardPage from '@/app/(portals)/exam-cell/dashboard/page';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));

describe('Examination Cell dashboard', () => {
  it('shows a failure and allows retry instead of showing zero counts', async () => {
    api.get.mockReset().mockRejectedValueOnce(new Error('Server unavailable')).mockResolvedValueOnce({
      pending_supplementary: 2, result_status_chart: [], recent_activity: [],
    });
    render(<ExamCellDashboardPage />);
    expect(screen.getByRole('heading', { name: 'Examination Command Center' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
    expect(screen.queryByText('Upcoming exams')).toBeNull();
    expect(screen.getByRole('link', { name: 'Form fill-up desk' })).toHaveAttribute('href', '/exam-cell/form-fillup');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('Upcoming exams')).toBeTruthy();
    expect(screen.getByText('Supplementary pending').parentElement?.parentElement?.querySelector('a'))
      .toHaveAttribute('href', '/exam-cell/backlog-exams');
  });

  it('groups metrics for the same workflow without losing counts or destinations', async () => {
    api.get.mockReset().mockResolvedValue({
      upcoming_exams: 4, todays_exams: 2, registered_students: 6, form_registrations: 5,
      hall_tickets_generated: 3, pending_hall_tickets: 1, pending_results: 7, pending_coe_marks: 8,
      result_status_chart: [], recent_activity: [],
    });
    render(<ExamCellDashboardPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
    expect(screen.getByText("Today's exams: 2")).toBeTruthy();
    expect(screen.getByText('Form registrations: 5')).toBeTruthy();
    expect(screen.getByText('Pending hall tickets: 1')).toBeTruthy();
    expect(screen.getByText('Pending COE review: 8')).toBeTruthy();
    const metricLinks = screen.getAllByRole('link', { name: /^Open / });
    expect(metricLinks).toHaveLength(11);
    expect(new Set(metricLinks.map((link) => link.getAttribute('href'))).size).toBe(11);
    expect(screen.getByRole('link', { name: 'Open pending results' })).toHaveAttribute('href', '/exam-cell/results');
    expect(screen.getByRole('link', { name: 'Open hall tickets generated' })).toHaveAttribute('href', '/exam-cell/admit-cards');
  });
});
