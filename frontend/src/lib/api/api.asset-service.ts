type Api = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
};
export type AssetServiceCase = {
  service_case_id: string;
  case_number: string;
  inventory_record_id: string;
  university_asset_id?: string;
  product_name: string;
  category: string;
  model_number?: string;
  case_type: string;
  workflow_status: string;
  coverage_status: string;
  asset_availability: string;
  final_outcome?: string;
  title: string;
  problem_description: string;
  severity: string;
  aggregate_revision: number;
  updated_at: string;
  coverage?: Array<Record<string, unknown>>;
  custody?: Array<Record<string, unknown>>;
  diagnoses?: Array<Record<string, unknown>>;
  estimates?: Array<Record<string, unknown>>;
  tasks?: Array<Record<string, unknown>>;
  parts?: Array<Record<string, unknown>>;
  reverification?: Array<Record<string, unknown>>;
  financial_projections?: Array<Record<string, unknown>>;
};
export type AssetServiceDashboard = {
  total: number;
  awaiting_triage: number;
  active: number;
  covered: number;
  retirement_referrals: number;
};
export function createAssetServiceApi(api: Api) {
  const root = "/api/asset-service/v1",
    idem = () => ({ "Idempotency-Key": crypto.randomUUID() }),
    mut = (revision: number) => ({ ...idem(), "If-Match": String(revision) });
  return {
    dashboard: () => api.get<AssetServiceDashboard>(`${root}/dashboard`),
    cases: () => api.get<AssetServiceCase[]>(`${root}/cases`),
    detail: (id: string) => api.get<AssetServiceCase>(`${root}/cases/${id}`),
    create: (body: Record<string, unknown>) =>
      api.post<{ service_case_id: string; aggregate_revision: number }>(
        `${root}/cases`,
        body,
        idem(),
      ),
    submit: (id: string, revision: number) =>
      api.post(`${root}/cases/${id}/submit`, {}, mut(revision)),
    triage: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/triage`, body, mut(revision)),
    coverage: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/coverage`, body, mut(revision)),
    assign: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/assign`, body, mut(revision)),
    start: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/start`, body, mut(revision)),
    diagnose: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/diagnoses`, body, mut(revision)),
    completeWork: (
      id: string,
      revision: number,
      body: Record<string, unknown>,
    ) => api.post(`${root}/cases/${id}/complete-work`, body, mut(revision)),
    estimate: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/estimates`, body, mut(revision)),
    addTask: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/tasks`, body, mut(revision)),
    addPart: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/parts`, body, mut(revision)),
    vendorReturn: (
      id: string,
      revision: number,
      body: Record<string, unknown>,
    ) => api.post(`${root}/cases/${id}/vendor-return`, body, mut(revision)),
    accept: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${id}/accept`, body, mut(revision)),
    supersede: (id: string, reason: string) =>
      api.post(`${root}/cases/${id}/supersede`, { reason }, idem()),
  };
}
