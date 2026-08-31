type Api = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
};
export type ReturnCase = {
  return_case_id: string;
  case_number: string;
  case_type: "DOA" | "STANDARD_RETURN";
  workflow_status: string;
  eligibility_status: string;
  disposition?: string;
  rma_status: string;
  shipment_status: string;
  reason: string;
  product_name: string;
  category: string;
  aggregate_revision: number;
  updated_at: string;
  allocations?: Array<Record<string, unknown>>;
  decisions?: Array<Record<string, unknown>>;
  communications?: Array<Record<string, unknown>>;
  financial_projections?: Array<Record<string, unknown>>;
};
export type ReturnDashboard = {
  total: number;
  awaiting_decision: number;
  in_execution: number;
  doa: number;
};
export function createReturnsApi(api: Api) {
  const root = "/api/returns/v1",
    idem = () => ({ "Idempotency-Key": crypto.randomUUID() }),
    mut = (revision: number) => ({ ...idem(), "If-Match": String(revision) });
  return {
    dashboard: () => api.get<ReturnDashboard>(`${root}/dashboard`),
    cases: () => api.get<ReturnCase[]>(`${root}/cases`),
    detail: (id: string) => api.get<ReturnCase>(`${root}/cases/${id}`),
    create: (body: Record<string, unknown>) =>
      api.post<{ return_case_id: string; aggregate_revision: number }>(
        `${root}/cases`,
        body,
        idem(),
      ),
    submit: (id: string, revision: number) =>
      api.post<ReturnCase>(`${root}/cases/${id}/submit`, {}, mut(revision)),
    evaluate: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/eligibility`, body, mut(revision)),
    approve: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/approve`, body, mut(revision)),
    transition: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/transition`, body, mut(revision)),
    rma: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/rma`, body, mut(revision)),
    shipment: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/shipment`, body, mut(revision)),
    reconsider: (id: string, revision: number, reason: string) =>
      api.post(`${root}/cases/${id}/reconsider`, { reason }, mut(revision)),
    resolve: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/resolve`, body, mut(revision)),
    communication: (id: string, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/communications`, body, idem()),
  };
}
