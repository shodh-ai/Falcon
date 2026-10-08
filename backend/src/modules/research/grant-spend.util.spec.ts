import { assertGrantSpendAllowed } from './grant-spend.util';

describe('assertGrantSpendAllowed', () => {
  it('allows equipment on ACTIVE grant with headroom', () => {
    expect(
      assertGrantSpendAllowed({
        grantStatus: 'ACTIVE',
        availableAmount: 100000,
        requestedAmount: 40000,
        expenseCategory: 'EQUIPMENT',
        allowedCategories: ['EQUIPMENT', 'CONSUMABLES'],
      }),
    ).toEqual({ ok: true });
  });

  it('blocks wrong category', () => {
    const r = assertGrantSpendAllowed({
      grantStatus: 'ACTIVE',
      availableAmount: 100000,
      requestedAmount: 1000,
      expenseCategory: 'TRAVEL',
      allowedCategories: ['EQUIPMENT'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('GRANT_CATEGORY_BLOCKED');
  });

  it('blocks overspend', () => {
    const r = assertGrantSpendAllowed({
      grantStatus: 'ACTIVE',
      availableAmount: 5000,
      requestedAmount: 6000,
      expenseCategory: 'EQUIPMENT',
      allowedCategories: ['EQUIPMENT'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('GRANT_INSUFFICIENT');
  });
});
