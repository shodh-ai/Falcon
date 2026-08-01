import { detectInvoiceSplitting } from './invoice-split.util';

describe('detectInvoiceSplitting', () => {
  it('flags many near-limit orders to same vendor', () => {
    const limit = 100000;
    const pos = [1, 2, 3].map((i) => ({
      po_id: `po-${i}`,
      amount: 90000,
      vendor_id: 'v1',
      requested_by: 'u1',
      created_at: new Date(),
    }));
    const signals = detectInvoiceSplitting(pos, limit);
    expect(signals).toHaveLength(1);
    expect(signals[0].order_count).toBe(3);
    expect(signals[0].total_amount).toBe(270000);
  });

  it('ignores sparse small orders', () => {
    const pos = [
      {
        po_id: 'a',
        amount: 5000,
        vendor_id: 'v1',
        requested_by: 'u1',
        created_at: new Date(),
      },
      {
        po_id: 'b',
        amount: 6000,
        vendor_id: 'v1',
        requested_by: 'u1',
        created_at: new Date(),
      },
    ];
    expect(detectInvoiceSplitting(pos, 100000)).toHaveLength(0);
  });
});
