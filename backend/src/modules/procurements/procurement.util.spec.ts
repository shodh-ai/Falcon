import {
  hash,
  lineTotal,
  minorUnits,
  moveBuckets,
  stableJson,
  withinTolerance,
} from './procurement.util';

describe('Module 2 procurement calculations', () => {
  it('calculates fixed-precision quantity and monetary totals', () => {
    expect(
      lineTotal({
        quantity: 2.555,
        unit_price: 99.995,
        tax_amount: 18.12,
        freight_amount: 5,
        additional_charges: 1.005,
      }),
    ).toEqual({
      product: 255.5,
      tax: 18.12,
      freight: 5,
      additional: 1.01,
      total: 279.63,
    });
    expect(minorUnits('0.005')).toBe(1n);
  });

  it('moves value between buckets exactly once and conserves allocation', () => {
    const initial = {
      AVAILABLE: 1_000_000,
      COMMITTED: 0,
      EXPENDED: 0,
      RELEASED: 0,
    };
    const committed = moveBuckets(initial, 'AVAILABLE', 'COMMITTED', 600_000);
    const paid = moveBuckets(committed, 'COMMITTED', 'EXPENDED', 400_000);
    expect(paid).toEqual({
      AVAILABLE: 400_000,
      COMMITTED: 200_000,
      EXPENDED: 400_000,
      RELEASED: 0,
    });
    expect(Object.values(paid).reduce((sum, amount) => sum + amount, 0)).toBe(
      1_000_000,
    );
  });

  it('supports cancellation, refund and final release without double counting', () => {
    let buckets = moveBuckets(
      { AVAILABLE: 400, COMMITTED: 400, EXPENDED: 200, RELEASED: 0 },
      'COMMITTED',
      'AVAILABLE',
      100,
    );
    buckets = moveBuckets(buckets, 'EXPENDED', 'AVAILABLE', 50);
    buckets = moveBuckets(buckets, 'AVAILABLE', 'RELEASED', 550);
    expect(buckets).toEqual({
      AVAILABLE: 0,
      COMMITTED: 300,
      EXPENDED: 150,
      RELEASED: 550,
    });
  });

  it('rejects overspending and same-bucket movements', () => {
    const balances = {
      AVAILABLE: 100,
      COMMITTED: 0,
      EXPENDED: 0,
      RELEASED: 0,
    };
    expect(() => moveBuckets(balances, 'AVAILABLE', 'COMMITTED', 101)).toThrow(
      'Insufficient AVAILABLE',
    );
    expect(() => moveBuckets(balances, 'AVAILABLE', 'AVAILABLE', 1)).toThrow(
      'must differ',
    );
  });

  it('applies configured percentage and rounding tolerances', () => {
    expect(withinTolerance(101, 100, 1, 0)).toBe(true);
    expect(withinTolerance(101.01, 100, 1, 0)).toBe(false);
    expect(withinTolerance(101.01, 100, 1, 0.01)).toBe(true);
  });

  it('uses stable object hashing regardless of key order', () => {
    expect(stableJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(hash({ b: 2, a: 1 })).toBe(hash({ a: 1, b: 2 }));
  });
});
