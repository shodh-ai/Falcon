import { computePenaltyNetPay } from './penalty-net.util';

describe('computePenaltyNetPay', () => {
  it('nets open penalties capped at gross', () => {
    const r = computePenaltyNetPay({
      grossAmount: 200000,
      openPenaltyAmounts: [50000, 25000],
    });
    expect(r.gross).toBe(200000);
    expect(r.penalties).toBe(75000);
    expect(r.net_paid).toBe(125000);
    expect(r.applied_count).toBe(2);
  });

  it('caps total penalties at invoice/PO amount', () => {
    const r = computePenaltyNetPay({
      grossAmount: 10000,
      openPenaltyAmounts: [8000, 5000],
    });
    expect(r.penalties).toBe(10000);
    expect(r.net_paid).toBe(0);
    expect(r.applied_count).toBe(2);
  });

  it('returns full gross when no penalties', () => {
    const r = computePenaltyNetPay({
      grossAmount: 5000,
      openPenaltyAmounts: [],
    });
    expect(r).toEqual({
      gross: 5000,
      penalties: 0,
      net_paid: 5000,
      applied_count: 0,
    });
  });
});
