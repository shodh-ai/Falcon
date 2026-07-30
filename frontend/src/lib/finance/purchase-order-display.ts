/** Human-readable PO labels — avoids pasting raw UUIDs in UAT. */

export type PurchaseOrderRow = {
  po_id: string;
  description?: string | null;
  amount?: string | number | null;
  status?: string | null;
};

export function shortPoId(poId: string | undefined | null): string {
  const id = String(poId ?? '').trim();
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export function formatPoAmount(amount: string | number | null | undefined): string {
  return Number(amount ?? 0).toLocaleString('en-IN');
}

export function formatPoOptionLabel(po: PurchaseOrderRow): string {
  const desc = po.description?.trim() || 'Purchase order';
  const amt = formatPoAmount(po.amount);
  const status = po.status ? ` · ${po.status}` : '';
  return `${desc} — ₹${amt}${status} · PO ${shortPoId(po.po_id)}`;
}

export async function copyPoId(poId: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    throw new Error('Clipboard not available');
  }
  await navigator.clipboard.writeText(poId);
}
