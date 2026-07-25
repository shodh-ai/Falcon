export type PoSplitRow = {
  po_id: string;
  amount: number;
  vendor_id: string | null;
  requested_by: string | null;
  created_at: Date | string;
};

export type InvoiceSplitSignal = {
  vendor_id: string;
  requested_by: string;
  order_count: number;
  total_amount: number;
  dofa_limit: number;
  po_ids: string[];
  message: string;
};

/**
 * Detect invoice splitting: multiple sub-limit POs to same vendor by same requester
 * that would collectively exceed the DOFA limit.
 */
export function detectInvoiceSplitting(
  pos: PoSplitRow[],
  dofaLimit: number,
  opts?: { minOrders?: number; nearLimitRatio?: number },
): InvoiceSplitSignal[] {
  const minOrders = opts?.minOrders ?? 3;
  const nearLimitRatio = opts?.nearLimitRatio ?? 0.9;
  if (!(dofaLimit > 0)) return [];

  const groups = new Map<string, PoSplitRow[]>();
  for (const po of pos) {
    if (!po.vendor_id || !po.requested_by) continue;
    const amt = Number(po.amount);
    if (!(amt > 0) || amt > dofaLimit) continue;
    const key = `${po.vendor_id}|${po.requested_by}`;
    const list = groups.get(key) ?? [];
    list.push(po);
    groups.set(key, list);
  }

  const signals: InvoiceSplitSignal[] = [];
  for (const [, rows] of groups) {
    if (rows.length < minOrders) continue;
    const nearLimitCount = rows.filter(
      (r) => Number(r.amount) >= dofaLimit * nearLimitRatio,
    ).length;
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const suspicious =
      (nearLimitCount >= minOrders && total > dofaLimit) ||
      (rows.length >= 5 && total > dofaLimit);

    if (!suspicious) continue;

    const vendorId = rows[0].vendor_id!;
    const requester = rows[0].requested_by!;
    signals.push({
      vendor_id: vendorId,
      requested_by: requester,
      order_count: rows.length,
      total_amount: total,
      dofa_limit: dofaLimit,
      po_ids: rows.map((r) => r.po_id),
      message: `Warning: ${rows.length} separate orders totaling ₹${total.toLocaleString('en-IN')} to the same vendor stay under the ₹${dofaLimit.toLocaleString('en-IN')} DOFA limit (invoice splitting).`,
    });
  }
  return signals;
}
