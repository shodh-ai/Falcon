export const LEADERSHIP_ANOMALY_QUEUE = 'leadership-anomaly';

export type LeadershipAnomalyJob =
  | { type: 'invoice_created'; tenantId: string; invoiceId: string }
  | { type: 'budget_check'; tenantId: string; departmentId: number; utilizationPct: number }
  | { type: 'nightly_scan'; tenantId: string };

export type FeedEventPayload = {
  event_id: string;
  event_type: 'INCOME' | 'EXPENSE' | 'ALERT';
  label: string;
  amount: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};
