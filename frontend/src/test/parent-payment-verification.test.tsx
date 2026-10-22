import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ParentFinancePage from '@/app/(portals)/parent/finance/page';
const { api, toast, mutate, checkout } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, toast: { success: vi.fn(), error: vi.fn() }, mutate: vi.fn(), checkout: { confirm: null as null | ((payment: string, verification?: { order_id?: string; signature?: string }) => Promise<void>) } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/context/ParentChildContext', () => ({ useParentChild: () => ({ selectedChildId: 'synthetic-child', selectedChild: { name: 'Synthetic child' }, loading: false }) }));
vi.mock('swr', () => ({ default: () => ({ data: [{ demand_id: 'synthetic-demand', fee_head: 'RE_EVALUATION', academic_year: '2026-27', semester: 4, total_amount: '500', paid_amount: '0', due_date: '2026-11-01', status: 'PENDING' }], isLoading: false, mutate }) }));
vi.mock('@/components/finance/RazorpayCheckout', () => ({ RazorpayCheckout: ({ onSuccess }: { onSuccess: NonNullable<typeof checkout.confirm> }) => { checkout.confirm = onSuccess; return <p>Provider checkout ready</p>; } }));
beforeEach(() => { api.post.mockReset().mockResolvedValueOnce({ order_id: 'order_synthetic', amount_inr: 500, fee_head: 'RE_EVALUATION', razorpay_key: 'synthetic-unit-key' }); toast.success.mockReset(); toast.error.mockReset(); mutate.mockReset(); checkout.confirm = null; });
describe('Parent payment verification result', () => {
  it('sends exact order and signature to protected confirmation and reports only verified settlement', async () => {
    api.post.mockResolvedValueOnce({ paid: true }); render(<ParentFinancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Pay with UPI / Razorpay' })); await screen.findByText('Provider checkout ready');
    await act(async () => checkout.confirm?.('pay_synthetic', { order_id: 'order_synthetic', signature: 'synthetic-signature' }));
    expect(api.post).toHaveBeenLastCalledWith('/api/parent/students/synthetic-child/payments/confirm', { demand_id: 'synthetic-demand', payment_id: 'pay_synthetic', order_id: 'order_synthetic', signature: 'synthetic-signature' });
    expect(toast.success).toHaveBeenCalledWith('Payment recorded successfully'); expect(mutate).toHaveBeenCalledTimes(1);
  });
  it('does not treat an unverified response as payment success or close the checkout', async () => {
    api.post.mockResolvedValueOnce({ paid: false }); render(<ParentFinancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Pay with UPI / Razorpay' })); await screen.findByText('Provider checkout ready');
    await expect(checkout.confirm?.('pay_synthetic')).rejects.toThrow('Payment has not been verified');
    expect(toast.success).not.toHaveBeenCalled(); expect(mutate).not.toHaveBeenCalled(); expect(screen.getByText('Provider checkout ready')).toBeTruthy();
  });
});
