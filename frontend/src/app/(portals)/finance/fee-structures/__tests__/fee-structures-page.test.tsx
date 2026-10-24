import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FinanceFeeStructuresPage from '../page';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
const { get, post } = api;
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('fee template and generation feedback', () => {
  afterEach(cleanup);
  beforeEach(() => {
    get.mockReset().mockResolvedValue([]);
    post.mockReset().mockResolvedValue({});
  });

  it('explains missing fields without posting an empty template', async () => {
    render(<FinanceFeeStructuresPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a template or batch name');
    expect(post).not.toHaveBeenCalled();
  });

  it('saves the exact entered semester and total without inventing a fee split', async () => {
    render(<FinanceFeeStructuresPage />);
    fireEvent.change(screen.getByLabelText('Template / batch name'), { target: { value: 'GVMC Semester 5' } });
    fireEvent.change(screen.getByLabelText('Academic year'), { target: { value: '2026-27' } });
    fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Total fee (₹)'), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/finance/fee-templates', expect.objectContaining({
      template_name: 'GVMC Semester 5', semester: 5, total_amount: 1500,
      fee_breakup: { total_amount: 1500 },
    })));
  });

  it('shows completion and a real demand-list link after polling the job', async () => {
    get.mockImplementation((url: string) => url === '/finance/fee-templates'
      ? Promise.resolve([{ template_id: 'template-1', template_name: 'Semester 5', academic_year: '2026-27', semester: 5, total_amount: '1500' }])
      : Promise.resolve({ status: 'COMPLETED', generated_count: 2 }));
    post.mockResolvedValue({ job_id: 'job-1' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<FinanceFeeStructuresPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Generate demands' }));
    expect(await screen.findByText(/Completed: 2 new demand/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View fee demands' })).toHaveAttribute('href', '/finance/fee-demands');
    vi.restoreAllMocks();
  });
});
