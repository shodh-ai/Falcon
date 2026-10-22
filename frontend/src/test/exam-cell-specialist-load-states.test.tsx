import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SeatingPlansPage from '@/app/(portals)/exam-cell/seating-plans/page';
import ProductVivaPage from '@/app/(portals)/exam-cell/product-viva/page';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { error: vi.fn() } }));

beforeEach(() => api.get.mockReset());

describe('Specialist workflow load states', () => {
  it('does not report zero published plans after a failed request and retries the API', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic plans unavailable')).mockResolvedValueOnce([]);
    render(<SeatingPlansPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic plans unavailable');
    expect(screen.queryByText('0 published room plans')).toBeNull();
    expect(screen.queryByText(/No seating plans published yet/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Open Seating Planner' })).toHaveAttribute('href', '/exam-cell/seating');
    fireEvent.click(screen.getByRole('button', { name: 'Retry seating plans' }));
    expect(await screen.findByText('0 published room plans')).toBeTruthy();
    expect(screen.getByText(/No seating plans published yet/)).toBeTruthy();
  });

  it('distinguishes Product Viva loading and failure from no assigned panelists and retries', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic panel unavailable')).mockResolvedValueOnce([{ panelist_id: 'synthetic-panelist', panelist_name: 'Synthetic industry panelist', panel_role: 'INDUSTRY', official_email: 'synthetic@example.test', course_offering_id: null }]);
    render(<ProductVivaPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByText(/No panelists assigned yet/)).toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic panel unavailable');
    expect(screen.queryByText(/No panelists assigned yet/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Product Viva panel' }));
    expect(await screen.findByText('Synthetic industry panelist — INDUSTRY')).toBeTruthy();
    expect(api.get).toHaveBeenLastCalledWith('/api/ecell/product-viva/panelists');
  });
});
