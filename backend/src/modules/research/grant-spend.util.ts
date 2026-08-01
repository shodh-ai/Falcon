/** Grant-constrained spending rules for RMS → P2P. */

export function assertGrantSpendAllowed(input: {
  grantStatus: string;
  availableAmount: number;
  requestedAmount: number;
  expenseCategory: string;
  allowedCategories: string[];
}): { ok: true } | { ok: false; code: string; message: string } {
  const status = String(input.grantStatus || '').toUpperCase();
  if (!['ACTIVE', 'SANCTIONED'].includes(status)) {
    return {
      ok: false,
      code: 'GRANT_NOT_ACTIVE',
      message: `Grant status ${status || 'UNKNOWN'} cannot fund procurement`,
    };
  }
  const cat = String(input.expenseCategory || '').toUpperCase();
  const allowed = (input.allowedCategories || []).map((c) => c.toUpperCase());
  if (allowed.length && !allowed.includes(cat)) {
    return {
      ok: false,
      code: 'GRANT_CATEGORY_BLOCKED',
      message: `Expense category ${cat} is not allowed on this grant`,
    };
  }
  if (Number(input.requestedAmount) > Number(input.availableAmount) + 0.009) {
    return {
      ok: false,
      code: 'GRANT_INSUFFICIENT',
      message: `Requested ₹${input.requestedAmount} exceeds available ₹${input.availableAmount}`,
    };
  }
  return { ok: true };
}
