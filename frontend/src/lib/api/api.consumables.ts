type Api = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
};
export type ConsumablesDashboard = {
  lots: number;
  store_on_hand: number;
  submitted: number;
  active: number;
  open_alerts: number;
  issued_custody_outstanding: number;
};
export type ConsumableLot = {
  inventory_record_id: string;
  lot_id: string;
  product_model_id: string;
  product_name: string;
  category: string;
  unit_of_measure: string;
  batch_number?: string;
  expiry_date?: string;
  store_on_hand: number;
  reserved: number;
  eligibility: string;
  location_text?: string;
};
export type StockRequest = {
  stock_request_id: string;
  request_number: string;
  requester_id: string;
  department_id: number;
  intended_use: string;
  priority: string;
  status: string;
  aggregate_revision: number;
  lines: Record<string, unknown>[];
};
export function createConsumablesApi(api: Api) {
  const root = "/api/consumables/v1",
    idem = () => ({ "Idempotency-Key": crypto.randomUUID() }),
    mut = (revision: number) => ({ ...idem(), "If-Match": String(revision) });
  return {
    dashboard: () => api.get<ConsumablesDashboard>(`${root}/dashboard`),
    balances: () => api.get<ConsumableLot[]>(`${root}/balances`),
    requests: () => api.get<StockRequest[]>(`${root}/requests`),
    issues: () => api.get<Record<string, unknown>[]>(`${root}/issues`),
    alerts: () => api.get<Record<string, unknown>[]>(`${root}/alerts`),
    counts: () => api.get<Record<string, unknown>[]>(`${root}/counts`),
    suggestions: () =>
      api.get<Record<string, unknown>[]>(`${root}/replenishment`),
    policies: () => api.get<Record<string, unknown>[]>(`${root}/policies`),
    createRequest: (body: Record<string, unknown>) =>
      api.post(`${root}/requests`, body, idem()),
    submit: (id: string, revision: number) =>
      api.post(`${root}/requests/${id}/submit`, {}, mut(revision)),
    approve: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/requests/${id}/approve`, body, mut(revision)),
    issue: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/requests/${id}/issue`, body, mut(revision)),
    custody: (id: string, body: Record<string, unknown>) =>
      api.post(`${root}/issues/${id}/custody`, body, idem()),
    acknowledge: (id: string) =>
      api.post(`${root}/issues/${id}/acknowledge`, {}, idem()),
    acknowledgeAlert: (id: string) =>
      api.post(`${root}/alerts/${id}/acknowledge`, {}, idem()),
    convert: (id: string, body: Record<string, unknown>) =>
      api.post(`${root}/replenishment/${id}/convert`, body, idem()),
  };
}
