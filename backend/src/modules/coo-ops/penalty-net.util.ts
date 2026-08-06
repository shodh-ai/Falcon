/** Net vendor SLA penalties against a PO/invoice amount (cap at gross). */

export function computePenaltyNetPay(input: {
  grossAmount: number;
  openPenaltyAmounts: number[];
}): {
  gross: number;
  penalties: number;
  net_paid: number;
  applied_count: number;
} {
  const gross = Math.max(0, Number(input.grossAmount) || 0);
  const sorted = (input.openPenaltyAmounts || [])
    .map((n) => Math.max(0, Number(n) || 0))
    .filter((n) => n > 0);
  let remaining = gross;
  let penalties = 0;
  let applied_count = 0;
  for (const amt of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(amt, remaining);
    penalties += take;
    remaining -= take;
    applied_count += 1;
  }
  return {
    gross,
    penalties: Math.round(penalties * 100) / 100,
    net_paid: Math.round(remaining * 100) / 100,
    applied_count,
  };
}
