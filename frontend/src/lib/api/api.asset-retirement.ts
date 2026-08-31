type Api = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
};

export type RetirementDashboard = {
  total: number;
  awaiting_approval: number;
  active: number;
  finance_reconciliation: number;
  sanitization_queue: number;
  completed: number;
};
export type RetirementAsset = {
  inventory_record_id: string;
  university_asset_id: string;
  manufacturer_serial?: string;
  product_name: string;
  category: string;
  model_number?: string;
  record_status: string;
  lifecycle_status: string;
  aggregate_revision: number;
};
export type RetirementCase = {
  retirement_case_id: string;
  case_number: string;
  title: string;
  retirement_reason: string;
  workflow_status: string;
  physical_status: string;
  finance_status: string;
  sanitization_status: string;
  disposition_method?: string;
  asset_count?: number;
  asset_ids?: string;
  aggregate_revision: number;
  updated_at: string;
  allocations?: Array<Record<string, unknown>>;
  assessments?: Array<Record<string, unknown>>;
  financial_snapshots?: Array<Record<string, unknown>>;
  approval_snapshots?: Array<Record<string, unknown>>;
  sanitization?: Array<Record<string, unknown>>;
  disposal_lots?: Array<Record<string, unknown>>;
  custody?: Array<Record<string, unknown>>;
  finance_projections?: Array<Record<string, unknown>>;
  certificates?: Array<Record<string, unknown>>;
};

export function createAssetRetirementApi(api: Api) {
  const root = "/api/asset-retirement/v1",
    idem = () => ({ "Idempotency-Key": crypto.randomUUID() }),
    mutation = (revision: number) => ({
      ...idem(),
      "If-Match": String(revision),
    });
  return {
    dashboard: () => api.get<RetirementDashboard>(`${root}/dashboard`),
    cases: () => api.get<RetirementCase[]>(`${root}/cases`),
    eligibleAssets: () => api.get<RetirementAsset[]>(`${root}/eligible-assets`),
    detail: (id: string) => api.get<RetirementCase>(`${root}/cases/${id}`),
    create: (body: Record<string, unknown>) =>
      api.post<{
        retirement_case_id: string;
        aggregate_revision: number;
      }>(`${root}/cases`, body, idem()),
    submit: (id: string, revision: number) =>
      api.post(`${root}/cases/${id}/submit`, {}, mutation(revision)),
    assess: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/assessments`, body, mutation(revision)),
    financialSnapshot: (
      id: string,
      revision: number,
      body: Record<string, unknown>,
    ) =>
      api.post(
        `${root}/cases/${id}/financial-snapshots`,
        body,
        mutation(revision),
      ),
    submitDofa: (id: string, revision: number) =>
      api.post(`${root}/cases/${id}/dofa-submit`, {}, mutation(revision)),
    startSanitization: (
      id: string,
      revision: number,
      body: Record<string, unknown>,
    ) => api.post(`${root}/cases/${id}/sanitization`, body, mutation(revision)),
    verifySanitization: (
      id: string,
      jobId: string,
      revision: number,
      body: Record<string, unknown>,
    ) =>
      api.post(
        `${root}/cases/${id}/sanitization/${jobId}/verify`,
        body,
        mutation(revision),
      ),
    createLot: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/disposal-lots`, body, mutation(revision)),
    lockLot: (id: string, lotId: string, revision: number) =>
      api.post(
        `${root}/cases/${id}/disposal-lots/${lotId}/lock`,
        {},
        mutation(revision),
      ),
    physicalCompletion: (
      id: string,
      revision: number,
      body: Record<string, unknown>,
    ) =>
      api.post(
        `${root}/cases/${id}/physical-completion`,
        body,
        mutation(revision),
      ),
    requestFinance: (id: string, revision: number) =>
      api.post(`${root}/cases/${id}/finance/request`, {}, mutation(revision)),
    recordFinance: (
      id: string,
      revision: number,
      body: Record<string, unknown>,
    ) =>
      api.post(
        `${root}/cases/${id}/finance/projections`,
        body,
        mutation(revision),
      ),
    issueCertificate: (id: string, revision: number) =>
      api.post(`${root}/cases/${id}/certificates`, {}, mutation(revision)),
    cancel: (id: string, revision: number, reason: string) =>
      api.post(`${root}/cases/${id}/cancel`, { reason }, mutation(revision)),
  };
}
